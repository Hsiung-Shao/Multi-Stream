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

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
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

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    const ip = getVisitorIp(request);
    if (isIpBanned(env, ip)) {
        return jsonResponse({ ok: false, error: 'banned' }, 403, request);
    }

    // ---- input shape 驗證(不依賴 auth 的部分先做,失敗就不必打 Supabase)----
    if (!body || typeof body !== 'object') {
        return jsonResponse({ ok: false, error: 'invalid_body' }, 400, request);
    }
    const { announcement_id, choices, text_response, device_id } = body;

    if (typeof announcement_id !== 'string') {
        return jsonResponse({ ok: false, error: 'announcement_id_required' }, 400, request);
    }

    // device_id 格式驗證(匿名必填的檢查要等 auth 結果,在下面)
    let deviceIdToUse = null;
    if (device_id !== undefined && device_id !== null && device_id !== '') {
        if (!isValidDeviceId(device_id)) {
            return jsonResponse({ ok: false, error: 'invalid_device_id' }, 400, request);
        }
        deviceIdToUse = device_id;
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

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    // ---- auth 與取公告互不依賴,平行打(各省一段 HTTP roundtrip)----
    const [{ userId }, announcement] = await Promise.all([
        getUserIdFromRequest(request, env),
        fetchAnnouncementById(env, announcement_id),
    ]);
    const isAuthed = !!userId;

    if (!isAuthed && !deviceIdToUse) {
        // DB CHECK: user_id IS NOT NULL OR device_id IS NOT NULL
        return jsonResponse({ ok: false, error: 'device_id_required' }, 400, request);
    }

    // ---- 校驗公告狀態 ----
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

    // ---- Rate limit(IP 與 device_id 是獨立 bucket,平行檢查)----
    if (env.RATE_LIMIT_KV) {
        const [ipCheck, devCheck] = await Promise.all([
            ip
                ? checkAndIncrementRespondRateLimit(env.RATE_LIMIT_KV, `ip:${ip}`)
                : Promise.resolve({ allowed: true }),
            deviceIdToUse
                ? checkAndIncrementRespondRateLimit(env.RATE_LIMIT_KV, `dev:${deviceIdToUse}`)
                : Promise.resolve({ allowed: true }),
        ]);
        if (!ipCheck.allowed || !devCheck.allowed) {
            return jsonResponse({ ok: false, error: 'rate_limited' }, 429, request);
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
