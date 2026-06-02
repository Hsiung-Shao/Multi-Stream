// 查一批 vtuber 的卡片 metadata + 訂閱變化 delta（#34）
//
// 給 /api/recommendations 與 /api/recommendations/for-you 共用，
// 避免兩處重複 vtubers select + subscriber_history delta 計算。
//
// delta：當前值（vtubers）− 第二新一筆 history。
//   Twitch history 每日一筆 → 日級；YouTube 每週一筆 → 週級（由記錄頻率自然決定）。

import { select } from './supabase-server.js';

const DELTA_WINDOW_DAYS = 14;

const VTUBER_FIELDS = [
    'id', 'name', 'img_url', 'nationality', 'activity',
    'youtube_channel_id', 'youtube_subscriber_count',
    'twitch_channel_id', 'twitch_follower_count',
    'group_id', 'languages', 'last_live_at',
].join(',');

/**
 * @param {Object} env
 * @param {string[]} vtuberIds
 * @returns {Promise<Map<string, object>>} id → vtuber metadata（含 *_delta）
 */
export async function fetchVtuberMeta(env, vtuberIds) {
    if (!vtuberIds || vtuberIds.length === 0) return new Map();

    const inClause = vtuberIds.map(id => encodeURIComponent(id)).join(',');
    const sinceIso = new Date(Date.now() - DELTA_WINDOW_DAYS * 86400000).toISOString();

    const [vRes, histRes] = await Promise.all([
        select(env, `vtubers?id=in.(${inClause})&select=${VTUBER_FIELDS}`),
        select(
            env,
            `vtuber_subscriber_history?vtuber_id=in.(${inClause})&recorded_at=gte.${encodeURIComponent(sinceIso)}&select=vtuber_id,platform,subscriber_count,recorded_at&order=recorded_at.desc`,
        ),
    ]);

    // 每 (vtuber, platform) 取「第二新」一筆當基準
    const prevMap = new Map();
    const seen = new Map();
    if (histRes.ok && Array.isArray(histRes.data)) {
        for (const h of histRes.data) {
            const key = `${h.vtuber_id}|${h.platform}`;
            const n = seen.get(key) || 0;
            if (n === 1) prevMap.set(key, h.subscriber_count);
            seen.set(key, n + 1);
        }
    }

    const map = new Map();
    if (vRes.ok && Array.isArray(vRes.data)) {
        for (const v of vRes.data) {
            const twPrev = prevMap.get(`${v.id}|twitch`);
            const ytPrev = prevMap.get(`${v.id}|youtube`);
            map.set(v.id, {
                ...v,
                twitch_follower_delta: (twPrev != null && v.twitch_follower_count != null) ? v.twitch_follower_count - twPrev : null,
                youtube_subscriber_delta: (ytPrev != null && v.youtube_subscriber_count != null) ? v.youtube_subscriber_count - ytPrev : null,
            });
        }
    }
    return map;
}
