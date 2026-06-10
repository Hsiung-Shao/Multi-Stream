// Cloudflare Pages Function：意見回饋寫入
//
// 走 service_role 繞過 feedbacks 表的 RLS（不論 INSERT policy 是否存在都能寫）
// 含基本驗證 + 簡易 IP rate limit（每 IP 每小時 5 次）

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { getVisitorIp, isIpBanned } from '../../lib/rate-limit.js';
import { insert } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';

const MAX_BODY_BYTES = 16 * 1024;

const FEEDBACK_TYPES = new Set(['bug', 'feature', 'ui', 'other']);

function trimStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max);
}

function validate(body) {
    if (!body || typeof body !== 'object') return '無效的請求資料';
    const { feedbackType, content } = body;
    if (!FEEDBACK_TYPES.has(feedbackType)) return 'feedbackType 必須為 bug / feature / ui / other';
    if (!trimStr(content, 5000)) return 'content 必填';
    if (content.length > 5000) return 'content 最多 5000 字';
    return null;
}

async function checkFeedbackRateLimit(kv, ip) {
    if (!ip || !kv) return true; // 沒 IP 或沒 KV 不擋（fail-open，因為 feedback 不是高風險）
    const hour = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');
    const key = `feedback:hour:${ip}:${hour}`;
    const raw = await kv.get(key);
    const count = parseInt(raw || '0', 10);
    if (count >= 5) return false;
    await kv.put(key, String(count + 1), { expirationTtl: 3700 });
    return true;
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (request.headers.get('Content-Type')?.includes('application/json') !== true) {
        return jsonResponse({ success: false, error: 'Invalid Content-Type' }, 400, request);
    }
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

    const ip = getVisitorIp(request);
    if (isIpBanned(env, ip)) {
        return jsonResponse({ success: false, error: '已封鎖' }, 403, request);
    }

    // Rate limit (fail-open if KV 沒設)
    if (env.RATE_LIMIT_KV) {
        const allowed = await checkFeedbackRateLimit(env.RATE_LIMIT_KV, ip);
        if (!allowed) {
            return jsonResponse({ success: false, error: '本小時提交已達上限（5 次）' }, 429, request);
        }
    }

    // 取登入用戶 user_id（可選，匿名也允許）
    const { userId } = await getUserIdFromRequest(request, env);

    // 驗證
    const validationError = validate(body);
    if (validationError) {
        return jsonResponse({ success: false, error: validationError }, 400, request);
    }

    // 寫入
    const row = {
        feedback_type: body.feedbackType,
        content: trimStr(body.content, 5000),
        source: trimStr(body.source, 50) || null,
        usage_time: Array.isArray(body.usageTime) && body.usageTime.length ? body.usageTime.slice(0, 4) : null,
        usage_duration: trimStr(body.usageDuration, 50) || null,
        rating: typeof body.rating === 'number' ? Math.max(1, Math.min(5, Math.round(body.rating))) : null,
        nps_score: typeof body.npsScore === 'number' ? Math.max(0, Math.min(10, Math.round(body.npsScore))) : null,
        user_agent: trimStr(body.userAgent, 500) || null,
        screen_resolution: trimStr(body.screenResolution, 50) || null,
        window_size: trimStr(body.windowSize, 50) || null,
        theme: trimStr(body.theme, 20) || null,
        app_version: trimStr(body.version, 50) || null,
        // 若 feedbacks 表有 user_id 欄位則 service_role 可以直接寫；沒有就被忽略（PostgREST 會 400）
        // 為相容，先不傳；如要記錄 userId，未來在 schema 確認後加
    };

    const result = await insert(env, 'feedbacks', row);
    if (!result.ok) {
        await logError(env, 'feedback-submit', 'insert feedbacks failed', {
            metadata: { status: result.status, error: result.error?.slice(0, 500) },
            requestIp: ip,
            userId: userId || undefined,
        });
        return jsonResponse({ success: false, error: '寫入失敗，請稍後再試' }, 500, request);
    }

    return jsonResponse({ success: true }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
