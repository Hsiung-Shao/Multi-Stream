// Twitch login → broadcaster id（helix/users，app token）
//
// 週表的直播中（/helix/streams）與週表（/helix/schedule）都靠 vtuber_channels.external_id（broadcaster id），
// 寫入 Twitch 帳號的後台流程（核准投稿、套用回報補充資料）都要先用這裡查好 id。

import { getTwitchAppToken } from './twitch-token.js';

/**
 * @param {string} login - 已正規化的 Twitch login
 * @param {Object} env - 需 TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET
 * @returns {Promise<{ ok: true, id: string, login: string, displayName: string|null } | { ok: false, error: 'twitch_not_found'|'twitch_fetch_failed' }>}
 */
export async function lookupTwitchUser(login, env) {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return { ok: false, error: 'twitch_fetch_failed' };
    try {
        const token = await getTwitchAppToken(env);
        const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
            headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { ok: false, error: 'twitch_fetch_failed' };
        const u = (await res.json())?.data?.[0];
        if (!u?.id) return { ok: false, error: 'twitch_not_found' };
        return { ok: true, id: String(u.id), login: String(u.login).toLowerCase(), displayName: u.display_name ?? null };
    } catch {
        return { ok: false, error: 'twitch_fetch_failed' };
    }
}

/** lookupTwitchUser 的錯誤 → HTTP 狀態（帳號不存在是輸入問題；查詢失敗是上游問題） */
export const twitchLookupStatus = (error) => (error === 'twitch_not_found' ? 400 : 502);
