// Cloudflare Pages Function：從收藏一鍵推薦 VTuber
//
// POST /api/vtuber/recommend-from-favorite
//   body: {
//     name: string,           // favorite.name
//     platform: 'twitch' | 'youtube',
//     channel_id: string,     // favorite.channel_id (twitch login or youtube channel id)
//     url: string,            // favorite.url
//   }
//
// 流程：
// 1. 驗 user_id（必須登入）
// 2. Rate limit（每 user 每日限額，與一般投稿共用 'vtuber' quota）
// 3. INSERT vtuber_contributions with status='approved'（信任「收藏+推薦」雙重意圖）
//
// 為何 status='approved'：
//   user 已收藏該 channel（隱含驗證），且明確點推薦按鈕（雙重意圖）→ 直接公開
//   admin 仍可在後台事後審查 / 撤下不當推薦

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest, checkAndIncrementQuota } from '../../lib/auth-helper.js';
import { insert } from '../../lib/supabase-server.js';
import { getRateLimits } from '../../lib/rate-limit.js';
import { logError, logInfo } from '../../lib/logger.js';

const MAX_BODY_BYTES = 4 * 1024;

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

function validate(body) {
    if (!body || typeof body !== 'object') return '無效的請求資料';
    const name = trimStr(body.name, 100);
    if (!name) return 'name 必填';
    if (body.platform !== 'twitch' && body.platform !== 'youtube') return 'platform 必須為 twitch / youtube';
    if (!body.channel_id || typeof body.channel_id !== 'string') return 'channel_id 必填';
    if (!isValidUrl(body.url)) return 'url 格式無效';
    return null;
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (env.CONTRIBUTION_BLOCKED === 'true') {
        return jsonResponse({ success: false, error: '推薦功能暫停中' }, 503, request);
    }

    // 1. Content-Type / size
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return jsonResponse({ success: false, error: 'Invalid Content-Type' }, 400, request);
    }
    if (parseInt(request.headers.get('Content-Length') || '0', 10) > MAX_BODY_BYTES) {
        return jsonResponse({ success: false, error: 'Body too large' }, 413, request);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ success: false, error: '無效的 JSON' }, 400, request);
    }

    // 2. 必須登入
    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ success: false, error: '請先登入' }, 401, request);
    }

    // 3. 輸入驗證
    const validationError = validate(body);
    if (validationError) {
        return jsonResponse({ success: false, error: validationError }, 400, request);
    }

    // 4. Rate limit（與一般 vtuber 投稿共用配額）
    const limits = getRateLimits(env);
    const result = await checkAndIncrementQuota(env, userId, 'vtuber', limits.vtuber.user.day);
    if (!result.allowed) {
        return jsonResponse({
            success: false,
            error: '本日推薦額度已達上限',
            current: result.newCount,
            limit: result.quotaLimit,
        }, 429, request);
    }

    // 5. 組 payload —— action='add' + 從 favorite metadata 對應到 vtuber_contributions schema
    const payload = {
        name: trimStr(body.name, 100),
    };
    if (body.platform === 'twitch') {
        payload.twitch_channel_id = body.channel_id;
    } else if (body.platform === 'youtube') {
        payload.youtube_channel_id = body.channel_id;
    }

    const row = {
        action: 'add',
        target_vtuber_id: null,
        payload,
        status: 'approved', // 「收藏+推薦」雙重意圖直接公開
        submitted_by: userId,
        submitter_contact: null,
        source_urls: [body.url],
        source_note: 'recommended_from_favorites',
    };

    const insertResult = await insert(env, 'vtuber_contributions', row);
    if (!insertResult.ok) {
        await logError(env, 'recommend-from-favorite', 'insert vtuber_contributions failed', {
            userId,
            metadata: { status: insertResult.status, error: insertResult.error?.slice(0, 500) },
        });
        return jsonResponse({ success: false, error: '寫入失敗，請稍後再試' }, 500, request);
    }

    await logInfo(env, 'recommend-from-favorite', 'recommended from favorite', {
        userId,
        metadata: { platform: body.platform, channel_id: body.channel_id, name: payload.name },
    });

    return jsonResponse({
        success: true,
        id: Array.isArray(insertResult.data) ? insertResult.data[0]?.id : null,
    }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
