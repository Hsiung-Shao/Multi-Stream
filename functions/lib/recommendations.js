// 推薦系統共用 helper
//
// 集中:
// 1. body 驗證(name/platform/channel_id/url/comment)
// 2. 確保 vtubers row 存在(借 recommend-from-favorite.js 的去重 + 建 row 邏輯)
// 3. 驗證 user 收藏中確實有此 url(防繞 UI 任意推任何頻道)
// 4. 留言 sanitize(trim + 禁 URL regex)
//
// 不引入 supabase-js,寫入都走 supabase-server.js raw fetch。

import { insert, select } from './supabase-server.js';
import { logError } from './logger.js';

export const COMMENT_MAX_LEN = 500;
export const NAME_MAX_LEN = 100;
export const URL_MAX_LEN = 2048;

export function trimStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max);
}

export function isValidUrl(s) {
    if (typeof s !== 'string' || s.length === 0 || s.length > URL_MAX_LEN) return false;
    try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * 驗證推薦 body
 * @returns {string|null} error message or null
 */
export function validateRecommendInput(body) {
    if (!body || typeof body !== 'object') return 'invalid_body';
    const name = trimStr(body.name, NAME_MAX_LEN);
    if (!name) return 'name_required';
    if (body.platform !== 'twitch' && body.platform !== 'youtube') return 'invalid_platform';
    if (!body.channel_id || typeof body.channel_id !== 'string' || body.channel_id.length > 100) {
        return 'invalid_channel_id';
    }
    if (!isValidUrl(body.url)) return 'invalid_url';
    if (body.comment !== undefined && body.comment !== null && body.comment !== '') {
        if (typeof body.comment !== 'string') return 'invalid_comment';
        const trimmed = body.comment.trim();
        if (trimmed.length === 0) return 'invalid_comment';
        if (trimmed.length > COMMENT_MAX_LEN) return 'comment_too_long';
        // 2026-05-17 移除 URL regex(user 偏好);spam 控制改靠管理員手動撤 row
    }
    return null;
}

/**
 * 驗證 user 收藏中確實有此 url（防繞 UI 任意推薦)
 * @returns {Promise<boolean>}
 */
export async function userHasFavorite(env, userId, url) {
    const res = await select(
        env,
        `user_favorites?user_id=eq.${encodeURIComponent(userId)}&url=eq.${encodeURIComponent(url)}&select=id&limit=1`,
    );
    return res.ok && Array.isArray(res.data) && res.data.length > 0;
}

/**
 * 確保 vtubers row 存在(複製 recommend-from-favorite.js 邏輯但無 contributions 寫入)
 * @param {{ name: string, platform: string, channelId: string, userId: string | null }} params
 * @returns {Promise<{ ok: boolean, vtuberId: string|null, alreadyExists: boolean, error?: string }>}
 */
export async function ensureVtuberRow(env, { name, platform, channelId, userId }) {
    const channelCol = platform === 'twitch' ? 'twitch_channel_id' : 'youtube_channel_id';
    const dedupeFilter = `${channelCol}=eq.${encodeURIComponent(channelId)}&select=id&limit=1`;
    const existsRes = await select(env, `vtubers?${dedupeFilter}`);
    if (existsRes.ok && Array.isArray(existsRes.data) && existsRes.data.length > 0) {
        return { ok: true, vtuberId: existsRes.data[0].id, alreadyExists: true };
    }
    // 不存在 → 新建(沿用 recommend-from-favorite.js 預設值)
    const vtuberRow = {
        name,
        img_url: null,
        activity: 'active',
        nationality: 'OTHER',
        group_id: null,
        youtube_channel_id: platform === 'youtube' ? channelId : null,
        twitch_channel_id: platform === 'twitch' ? channelId : null,
        debut_date: null,
        channel_id_verified: false,
        contributed_by: userId,
    };
    const createRes = await insert(env, 'vtubers', vtuberRow);
    if (!createRes.ok) {
        await logError(env, 'recommendations', 'ensure vtubers insert failed', {
            userId,
            metadata: { status: createRes.status, error: createRes.error?.slice(0, 500) },
        });
        return { ok: false, vtuberId: null, alreadyExists: false, error: 'create_vtuber_failed' };
    }
    const id = Array.isArray(createRes.data) ? createRes.data[0]?.id : null;
    return { ok: !!id, vtuberId: id, alreadyExists: false };
}
