// Cloudflare Pages Function：建立 VTuber 活動
//
// 同 vtuber-contribute.js 結構，但寫入 vtuber_events table，type='event'
// 預設只允許登入（與 vtuber 投稿開放匿名不同），可由 ALLOW_ANON_EVENT 切換

import { jsonResponse, handleOptions } from '../lib/cors.js';
import { getUserIdFromRequest, checkAndIncrementQuota } from '../lib/auth-helper.js';
import { checkAndIncrementAnonQuota, getVisitorIp, isIpBanned, RATE_LIMITS } from '../lib/rate-limit.js';
import { insert } from '../lib/supabase-server.js';

const MAX_BODY_BYTES = 16 * 1024;
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const EVENT_TYPES = new Set(['vtuber_event', 'livestream', 'community']);

function trimStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max);
}

function isValidUrl(s) {
    if (typeof s !== 'string' || s.length === 0 || s.length > 2048) return false;
    try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidIso(s) {
    if (typeof s !== 'string') return false;
    const d = new Date(s);
    return !isNaN(d.getTime());
}

function validate(body) {
    if (!body || typeof body !== 'object') return '無效的請求資料';
    const { title, description, eventType, startTime, endTime, location, url, imageUrl } = body;

    if (!trimStr(title, 200)) return 'title 必填';
    if (title.length > 200) return 'title 最多 200 字';
    if (description && description.length > 2000) return 'description 最多 2000 字';
    if (!EVENT_TYPES.has(eventType)) return 'eventType 無效';
    if (!isValidIso(startTime)) return 'startTime 格式錯誤';
    if (endTime && !isValidIso(endTime)) return 'endTime 格式錯誤';
    if (endTime && new Date(endTime) <= new Date(startTime)) return 'endTime 必須晚於 startTime';
    if (location && location.length > 200) return 'location 最多 200 字';
    if (url && !isValidUrl(url)) return 'url 格式錯誤';
    if (imageUrl && !isValidUrl(imageUrl)) return 'imageUrl 格式錯誤';
    return null;
}

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

export async function onRequestPost(context) {
    const { request, env } = context;

    if (env.CONTRIBUTION_BLOCKED === 'true') {
        return jsonResponse({ success: false, error: '活動建立暫停中' }, 503, request);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
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

    const { userId } = await getUserIdFromRequest(request, env);
    const isAnon = !userId;

    // 預設活動建立需登入；env.ALLOW_ANON_EVENT='true' 才開放匿名
    if (isAnon && env.ALLOW_ANON_EVENT !== 'true') {
        return jsonResponse({ success: false, error: '請先登入再建立活動' }, 401, request);
    }
    // 全局強制登入也適用
    if (env.REQUIRE_LOGIN_FOR_CONTRIBUTION === 'true' && isAnon) {
        return jsonResponse({ success: false, error: '請先登入' }, 401, request);
    }

    if (env.ENFORCE_TURNSTILE === 'true') {
        const ok = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
        if (!ok) {
            return jsonResponse({ success: false, error: '驗證失敗，請重試' }, 403, request);
        }
    }

    const validationError = validate(body);
    if (validationError) {
        return jsonResponse({ success: false, error: validationError }, 400, request);
    }

    if (isAnon) {
        if (!env.RATE_LIMIT_KV) {
            return jsonResponse({ success: false, error: 'KV not configured' }, 500, request);
        }
        const result = await checkAndIncrementAnonQuota(env.RATE_LIMIT_KV, ip, 'event');
        if (!result.allowed) {
            return jsonResponse({
                success: false,
                error: result.reason === 'hour_limit' ? '本小時建立次數已達上限' : '本日建立次數已達上限',
            }, 429, request);
        }
    } else {
        const result = await checkAndIncrementQuota(env, userId, 'event', RATE_LIMITS.event.user.day);
        if (!result.allowed) {
            return jsonResponse({
                success: false,
                error: '本日建立次數已達上限',
            }, 429, request);
        }
    }

    const row = {
        title: trimStr(body.title, 200),
        description: trimStr(body.description, 2000) || null,
        event_type: body.eventType,
        vtuber_id: body.vtuberId || null,
        organizer_id: userId, // 匿名為 null
        start_time: body.startTime,
        end_time: body.endTime || null,
        location: trimStr(body.location, 200) || null,
        url: body.url || null,
        image_url: body.imageUrl || null,
        status: 'pending',
    };

    const result = await insert(env, 'vtuber_events', row);
    if (!result.ok) {
        return jsonResponse({ success: false, error: '寫入失敗，請稍後再試' }, 500, request);
    }

    return jsonResponse({
        success: true,
        id: Array.isArray(result.data) ? result.data[0]?.id : null,
    }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
