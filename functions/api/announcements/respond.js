// Cloudflare Pages Function: 公告回應提交(投票/問卷)
//
// POST /api/announcements/respond
//   body: { announcement_id: string, choices?: any, text_response?: string, device_id?: string }
//
// 驗證流程:
//   1. announcement 存在 + status=published + 在時間窗內(用 service_role)
//   2. target_segment=authenticated 時 caller 必須有 userId
//   3. 視 type 驗 choices / text_response 結構(包含 option_id 是否在 payload 內)
//   4. device_id 若有,長度 1-128
//   5. anon: 必須提供 device_id;authed: 用 user_id(忽略 device_id)
//   6. KV rate limit: per IP & per device_id 每分鐘 10 次
//
// 寫入:用 service_role insert 進 announcement_responses
//   - 重複(unique constraint violation)→ 回 { ok: false, reason: 'already_responded' } 200
//
// 不洩漏 announcement 內部錯誤細節給 caller。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { getVisitorIp, isIpBanned } from '../../lib/rate-limit.js';
import { insert } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';
import {
    fetchAnnouncementById,
    isAnnouncementActive,
    validateResponseAgainstAnnouncement,
    isValidDeviceId,
    checkAndIncrementRespondRateLimit,
    TEXT_RESPONSE_MAX_LEN,
} from '../../lib/announcements.js';

const MAX_BODY_BYTES = 16 * 1024;

export async function onRequestPost(context) {
    const { request, env } = context;

    // Content-Type / size 守門
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return jsonResponse({ ok: false, error: 'invalid_content_type' }, 400, request);
    }
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ ok: false, error: 'body_too_large' }, 413, request);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ ok: false, error: 'invalid_json' }, 400, request);
    }

    const ip = getVisitorIp(request);
    if (isIpBanned(env, ip)) {
        return jsonResponse({ ok: false, error: 'banned' }, 403, request);
    }

    const { userId } = await getUserIdFromRequest(request, env);
    const isAuthed = !!userId;

    // ---- input shape 驗證 ----
    if (!body || typeof body !== 'object') {
        return jsonResponse({ ok: false, error: 'invalid_body' }, 400, request);
    }
    const { announcement_id, choices, text_response, device_id } = body;

    if (typeof announcement_id !== 'string') {
        return jsonResponse({ ok: false, error: 'announcement_id_required' }, 400, request);
    }

    // device_id 驗證 + 匿名必填
    let deviceIdToUse = null;
    if (device_id !== undefined && device_id !== null && device_id !== '') {
        if (!isValidDeviceId(device_id)) {
            return jsonResponse({ ok: false, error: 'invalid_device_id' }, 400, request);
        }
        deviceIdToUse = device_id;
    }
    if (!isAuthed && !deviceIdToUse) {
        // DB CHECK: user_id IS NOT NULL OR device_id IS NOT NULL
        return jsonResponse({ ok: false, error: 'device_id_required' }, 400, request);
    }

    // text_response 長度
    let textResponseToUse = null;
    if (text_response !== undefined && text_response !== null && text_response !== '') {
        if (typeof text_response !== 'string') {
            return jsonResponse({ ok: false, error: 'invalid_text_response' }, 400, request);
        }
        const trimmed = text_response.trim();
        if (trimmed.length === 0) {
            return jsonResponse({ ok: false, error: 'invalid_text_response' }, 400, request);
        }
        if (trimmed.length > TEXT_RESPONSE_MAX_LEN) {
            return jsonResponse({ ok: false, error: 'text_response_too_long' }, 400, request);
        }
        textResponseToUse = trimmed;
    }

    // ---- 取公告 + 校驗狀態 ----
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }
    const announcement = await fetchAnnouncementById(env, announcement_id);
    if (!announcement) {
        return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    }
    if (!isAnnouncementActive(announcement)) {
        return jsonResponse({ ok: false, error: 'not_active' }, 410, request);
    }
    if (announcement.target_segment === 'authenticated' && !isAuthed) {
        return jsonResponse({ ok: false, error: 'login_required' }, 401, request);
    }

    // ---- choices / text_response 內容驗證(對齊 payload) ----
    const validation = validateResponseAgainstAnnouncement(announcement, {
        choices,
        text_response: textResponseToUse,
    });
    if (!validation.ok) {
        return jsonResponse({ ok: false, error: validation.error }, 400, request);
    }

    // ---- Rate limit ----
    if (env.RATE_LIMIT_KV) {
        // IP rate limit
        if (ip) {
            const r = await checkAndIncrementRespondRateLimit(env.RATE_LIMIT_KV, `ip:${ip}`);
            if (!r.allowed) {
                return jsonResponse({ ok: false, error: 'rate_limited' }, 429, request);
            }
        }
        // device_id rate limit(獨立 bucket;避免單 IP 多裝置共用 IP 互相影響)
        if (deviceIdToUse) {
            const r = await checkAndIncrementRespondRateLimit(env.RATE_LIMIT_KV, `dev:${deviceIdToUse}`);
            if (!r.allowed) {
                return jsonResponse({ ok: false, error: 'rate_limited' }, 429, request);
            }
        }
    }

    // ---- 寫入 ----
    // 已登入時 user_id 寫上;device_id 對 unique constraint 沒影響(unique 是 partial index where user_id is null)
    // 設計上 authed 也允許帶 device_id(例如登入前後 merge),但兩者只用其一去重(看 RLS 那邊的 partial unique)
    const row = {
        announcement_id,
        user_id: isAuthed ? userId : null,
        device_id: isAuthed ? null : deviceIdToUse, // authed 不存 device_id,避免 unique device 索引被佔用導致 anon 無法投
        choices: Array.isArray(choices) ? choices : null,
        text_response: textResponseToUse,
    };

    const result = await insert(env, 'announcement_responses', row);
    if (!result.ok) {
        // PostgREST 對 unique 衝突回 23505 / 409
        const status = result.status;
        const errStr = result.error || '';
        if (status === 409 || /23505|duplicate key/i.test(errStr)) {
            return jsonResponse({ ok: false, reason: 'already_responded' }, 200, request);
        }
        await logError(env, 'announcements-respond', 'insert failed', {
            metadata: { status, error: errStr.slice(0, 500), announcement_id },
            requestIp: ip,
            userId: userId || undefined,
        });
        return jsonResponse({ ok: false, error: 'write_failed' }, 500, request);
    }

    return jsonResponse({ ok: true }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
