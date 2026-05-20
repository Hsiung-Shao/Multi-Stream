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

// 對齊 src/lib/locale.ts SUPPORTED_VTUBER_LANGS(後端不引前端 module,獨立宣告)
const VTUBER_LANGS = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];

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
    if (body.anonymous_id !== undefined && body.anonymous_id !== null) {
        if (typeof body.anonymous_id !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(body.anonymous_id)) {
            return 'invalid_anonymous_id';
        }
    }
    if (body.category_ids !== undefined && body.category_ids !== null) {
        if (!Array.isArray(body.category_ids)) return 'invalid_category_ids';
        if (body.category_ids.length > 10) return 'too_many_categories';
        for (const id of body.category_ids) {
            if (typeof id !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(id)) {
                return 'invalid_category_id';
            }
        }
    }
    if (body.languages !== undefined && body.languages !== null) {
        if (!Array.isArray(body.languages)) return 'invalid_languages';
        if (body.languages.length > 5) return 'too_many_languages';
        for (const l of body.languages) {
            if (typeof l !== 'string' || !VTUBER_LANGS.includes(l)) return 'invalid_language';
        }
    }
    if (body.img_url !== undefined && body.img_url !== null && body.img_url !== '') {
        if (!isValidUrl(body.img_url)) return 'invalid_img_url';
    }
    if (body.cross_channel_id !== undefined && body.cross_channel_id !== null && body.cross_channel_id !== '') {
        if (typeof body.cross_channel_id !== 'string' || body.cross_channel_id.length > 100) {
            return 'invalid_cross_channel_id';
        }
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
 * 確保 vtubers row 存在,並 merge 補缺的 metadata。
 *
 * Dedupe 策略(2026-05-17 #4 修):
 *   1. 先用 user 推的 platform 對應欄位找(主鍵)
 *   2. 找不到 + 有 crossChannelId(另一 platform) → 也用該欄位找
 *   3. 找不到 → 新建 row
 *   4. 找到既有 row → UPDATE 補缺欄位:
 *      - 缺對應 platform channel_id → 補上
 *      - 缺 img_url 且 user 帶了新 → 補上
 *      - 缺 languages 或 languages 是空陣列 → 寫入新的(避免覆蓋既有非空 languages)
 *
 * @param {Object} env
 * @param {{
 *   name: string,
 *   platform: 'twitch'|'youtube',
 *   channelId: string,
 *   userId: string | null,
 *   imgUrl?: string | null,
 *   languages?: string[] | null,
 *   crossChannelId?: string | null,   // 另一 platform 的 channel_id(若 user 兩邊都有,前端可一起送)
 * }} params
 * @returns {Promise<{ ok: boolean, vtuberId: string|null, alreadyExists: boolean, merged?: boolean, error?: string }>}
 */
export async function ensureVtuberRow(env, params) {
    const { name, platform, channelId, userId, imgUrl, languages, crossChannelId } = params;

    // ---- 1. 用 user 推的 platform 找 ----
    const mainCol = platform === 'twitch' ? 'twitch_channel_id' : 'youtube_channel_id';
    const crossCol = platform === 'twitch' ? 'youtube_channel_id' : 'twitch_channel_id';

    let existing = null;
    const mainRes = await select(
        env,
        `vtubers?${mainCol}=eq.${encodeURIComponent(channelId)}&select=id,name,img_url,languages,twitch_channel_id,youtube_channel_id&limit=1`,
    );
    if (mainRes.ok && Array.isArray(mainRes.data) && mainRes.data.length > 0) {
        existing = mainRes.data[0];
    }

    // ---- 2. 若主鍵找不到,且 user 帶了另一 platform 的 channel_id → 試 cross ----
    if (!existing && typeof crossChannelId === 'string' && crossChannelId.length > 0) {
        const crossRes = await select(
            env,
            `vtubers?${crossCol}=eq.${encodeURIComponent(crossChannelId)}&select=id,name,img_url,languages,twitch_channel_id,youtube_channel_id&limit=1`,
        );
        if (crossRes.ok && Array.isArray(crossRes.data) && crossRes.data.length > 0) {
            existing = crossRes.data[0];
        }
    }

    // ---- 3. 找到既有 → UPDATE 補缺欄位 ----
    if (existing) {
        const patch = {};
        if (!existing[mainCol]) patch[mainCol] = channelId;
        if (typeof crossChannelId === 'string' && crossChannelId.length > 0 && !existing[crossCol]) {
            patch[crossCol] = crossChannelId;
        }
        if (typeof imgUrl === 'string' && imgUrl.length > 0 && !existing.img_url) {
            patch.img_url = imgUrl;
        }
        // languages:row 是 null / [] 才寫入(避免覆蓋既有 user 設定)
        const existingLangs = Array.isArray(existing.languages) ? existing.languages : null;
        if (Array.isArray(languages) && languages.length > 0
            && (!existingLangs || existingLangs.length === 0)) {
            patch.languages = languages;
        }
        if (Object.keys(patch).length > 0) {
            // 用 PATCH UPDATE
            try {
                const upd = await fetch(
                    `${env.SUPABASE_URL}/rest/v1/vtubers?id=eq.${encodeURIComponent(existing.id)}`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                            Prefer: 'return=minimal',
                        },
                        body: JSON.stringify(patch),
                    },
                );
                if (!upd.ok) {
                    const err = await upd.text().catch(() => '');
                    await logError(env, 'recommendations', 'merge update vtubers failed', {
                        userId,
                        metadata: { status: upd.status, error: err.slice(0, 500), vtuber_id: existing.id, patch_keys: Object.keys(patch) },
                    });
                    // 不阻塞:既有 row 仍可推薦
                }
            } catch (e) {
                await logError(env, 'recommendations', 'merge update threw', {
                    userId,
                    metadata: { error: String(e).slice(0, 300), vtuber_id: existing.id },
                });
            }
        }
        return { ok: true, vtuberId: existing.id, alreadyExists: true, merged: Object.keys(patch).length > 0 };
    }

    // ---- 4. 不存在 → 新建,帶 user 送來的 metadata ----
    const vtuberRow = {
        name,
        img_url: typeof imgUrl === 'string' && imgUrl.length > 0 ? imgUrl : null,
        activity: 'active',
        nationality: 'OTHER',
        group_id: null,
        youtube_channel_id: platform === 'youtube' ? channelId : (crossChannelId && platform === 'twitch' ? crossChannelId : null),
        twitch_channel_id: platform === 'twitch' ? channelId : (crossChannelId && platform === 'youtube' ? crossChannelId : null),
        debut_date: null,
        channel_id_verified: false,
        contributed_by: userId,
        languages: Array.isArray(languages) && languages.length > 0 ? languages : null,
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
