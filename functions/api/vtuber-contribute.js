// Cloudflare Pages Function：VTuber 投稿端點
//
// 中介層，承擔：
// 1. 全局 kill switch（CONTRIBUTION_BLOCKED）
// 2. IP banlist
// 3. (可選) Turnstile 驗證（ENFORCE_TURNSTILE 開啟時生效）
// 4. (可選) 強制登入（REQUIRE_LOGIN_FOR_CONTRIBUTION 開啟時匿名一律 401）
// 5. Rate limit：
//    - 登入：呼叫 increment_contribution_quota RPC（DB 端原子化）
//    - 匿名：Cloudflare KV IP 限速
// 6. 輸入驗證
// 7. 用 SERVICE_ROLE_KEY 寫入 vtuber_contributions（繞過 RLS，因為 RLS 沒有 INSERT policy）
//
// 環境變數：
// - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (secret)
// - SUPABASE_JWT_SECRET (secret, optional — 設了就嚴格驗章)
// - TURNSTILE_SECRET_KEY (secret, only used when ENFORCE_TURNSTILE=true)
// - REQUIRE_LOGIN_FOR_CONTRIBUTION ('true'|'false')
// - ENFORCE_TURNSTILE ('true'|'false')
// - CONTRIBUTION_BLOCKED ('true'|'false')
// - BANNED_IPS (comma-separated)
//
// KV Binding: RATE_LIMIT_KV

import { jsonResponse, handleOptions } from '../lib/cors.js';
import { getUserIdFromRequest, checkAndIncrementQuota } from '../lib/auth-helper.js';
import { checkAndIncrementAnonQuota, getVisitorIp, isIpBanned, getRateLimits } from '../lib/rate-limit.js';
import { insert } from '../lib/supabase-server.js';
import { logError } from '../lib/logger.js';

const MAX_BODY_BYTES = 16 * 1024; // 16KB
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// ========== 輸入驗證 ==========

const ACTIONS = new Set(['add', 'edit', 'delete']);
const NATIONALITIES = new Set(['TW', 'HK', 'MY', 'JP', 'KR', 'OTHER']);

function isValidUrl(s) {
    if (typeof s !== 'string' || s.length === 0 || s.length > 2048) return false;
    try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function trimStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max);
}

function validate(body) {
    if (!body || typeof body !== 'object') return '無效的請求資料';
    const { action, payload, sourceUrls, sourceNote, contributorName, contributorContact, targetVtuberId } = body;

    if (!ACTIONS.has(action)) return 'action 必須為 add/edit/delete';
    if (action !== 'add' && !targetVtuberId) return 'edit/delete 必須提供 targetVtuberId';
    if (!payload || typeof payload !== 'object') return 'payload 必填';

    // payload 限制
    if (action === 'add') {
        if (!trimStr(payload.name, 100)) return 'name 必填';
        if (payload.nationality && !NATIONALITIES.has(payload.nationality)) return 'nationality 無效';
    }

    // sourceUrls
    if (!Array.isArray(sourceUrls) || sourceUrls.length === 0) return 'sourceUrls 至少 1 筆';
    if (sourceUrls.length > 5) return 'sourceUrls 最多 5 筆';
    for (const u of sourceUrls) {
        if (!isValidUrl(u)) return `來源 URL 格式無效: ${String(u).slice(0, 50)}`;
    }

    // sourceNote / contributor
    if (sourceNote && typeof sourceNote !== 'string') return 'sourceNote 格式錯誤';
    if (sourceNote && sourceNote.length > 500) return 'sourceNote 最多 500 字';
    if (contributorName && contributorName.length > 50) return 'contributorName 最多 50 字';
    if (contributorContact && contributorContact.length > 200) return 'contributorContact 最多 200 字';

    return null;
}

// ========== Turnstile ==========

async function verifyTurnstile(token, ip, secret) {
    if (!secret || !token) return false;
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);
    try {
        const res = await fetch(SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
        });
        const data = await res.json();
        return !!data.success;
    } catch {
        return false;
    }
}

// ========== Main handler ==========

export async function onRequestPost(context) {
    const { request, env } = context;

    // 0. Kill switch
    if (env.CONTRIBUTION_BLOCKED === 'true') {
        return jsonResponse({ success: false, error: '投稿功能暫停中' }, 503, request);
    }

    // 1. Content-Type 檢查
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return jsonResponse({ success: false, error: 'Invalid Content-Type' }, 400, request);
    }

    // 2. Body size limit
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ success: false, error: 'Body too large' }, 413, request);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ success: false, error: '無效的 JSON' }, 400, request);
    }

    // 3. IP banlist
    const ip = getVisitorIp(request);
    if (isIpBanned(env, ip)) {
        return jsonResponse({ success: false, error: '已封鎖' }, 403, request);
    }

    // 4. JWT → user_id（可能 null = 匿名）
    const { userId } = await getUserIdFromRequest(request, env);
    const isAnon = !userId;

    // 5. 強制登入開關
    if (env.REQUIRE_LOGIN_FOR_CONTRIBUTION === 'true' && isAnon) {
        return jsonResponse({ success: false, error: '請先登入' }, 401, request);
    }

    // 6. Turnstile（可選）
    if (env.ENFORCE_TURNSTILE === 'true') {
        const ok = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
        if (!ok) {
            return jsonResponse({ success: false, error: '驗證失敗，請重試' }, 403, request);
        }
    }

    // 7. 輸入驗證
    const validationError = validate(body);
    if (validationError) {
        return jsonResponse({ success: false, error: validationError }, 400, request);
    }

    // 8. Rate limit
    const limits = getRateLimits(env);
    if (isAnon) {
        if (!env.RATE_LIMIT_KV) {
            await logError(env, 'vtuber-contribute', 'RATE_LIMIT_KV not configured', { requestIp: ip });
            return jsonResponse({ success: false, error: 'KV not configured' }, 500, request);
        }
        const result = await checkAndIncrementAnonQuota(env.RATE_LIMIT_KV, ip, 'vtuber', limits.vtuber.anon);
        if (!result.allowed) {
            return jsonResponse({
                success: false,
                error: result.reason === 'hour_limit' ? '本小時投稿已達上限' : '本日投稿已達上限',
                current: result.current,
                limit: result.limit,
            }, 429, request);
        }
    } else {
        const result = await checkAndIncrementQuota(env, userId, 'vtuber', limits.vtuber.user.day);
        if (!result.allowed) {
            return jsonResponse({
                success: false,
                error: '本日投稿已達上限',
                current: result.newCount,
                limit: result.quotaLimit,
            }, 429, request);
        }
    }

    // 9. 寫入 vtuber_contributions
    const row = {
        action: body.action,
        target_vtuber_id: body.targetVtuberId || null,
        payload: body.payload || {},
        status: 'pending',
        submitted_by: isAnon ? trimStr(body.contributorName, 50) || 'anonymous' : userId,
        submitter_contact: isAnon ? trimStr(body.contributorContact, 200) || null : null,
        source_urls: body.sourceUrls,
        source_note: trimStr(body.sourceNote, 500) || null,
    };

    const result = await insert(env, 'vtuber_contributions', row);
    if (!result.ok) {
        await logError(env, 'vtuber-contribute', 'insert vtuber_contributions failed', {
            metadata: { status: result.status, error: result.error?.slice(0, 500) },
            requestIp: ip,
            userId: userId || undefined,
        });
        return jsonResponse({ success: false, error: '寫入失敗，請稍後再試' }, 500, request);
    }

    return jsonResponse({
        success: true,
        id: Array.isArray(result.data) ? result.data[0]?.id : null,
        anonymous: isAnon,
    }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
