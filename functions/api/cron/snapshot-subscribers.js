// Cloudflare Pages Function：每日訂閱數快照
//
// POST /api/cron/snapshot-subscribers
//   Authorization: Bearer ${CRON_SHARED_SECRET}
//
// 流程（每日觸發一次）：
//   Twitch：helix /users?login=batch 換 broadcaster_id → /channels/followers 拿 total（精確）
//           → UPDATE vtubers.twitch_follower_count + INSERT history（每日一筆，日級變化）
//   YouTube：channels.list?part=statistics&id=batch 拿 subscriberCount（API 四捨五入到 3 位有效）
//           → UPDATE vtubers.youtube_subscriber_count；history 每「ISO 週」只記一筆（週級變化）
//
// 環境變數：
//   CRON_SHARED_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET
//   YOUTUBE_API_KEY（選 YOUTUBE_API_REFERER：key 有 HTTP referer 限制時需帶）

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { select, update, insert } from '../../lib/supabase-server.js';
import { logError, logInfo } from '../../lib/logger.js';
import { getTwitchAppToken } from '../../lib/twitch-token.js';

const TWITCH_USERS_URL = 'https://api.twitch.tv/helix/users';
const TWITCH_FOLLOWERS_URL = 'https://api.twitch.tv/helix/channels/followers';
const YT_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';
const UC_RE = /^UC[A-Za-z0-9_-]{22}$/;
const YT_BATCH = 50;       // channels.list 一次最多 50 個 id
const TWITCH_USER_BATCH = 100;

// ===== Twitch =====
// getTwitchAppToken 改用 lib/twitch-token.js（KV 快取，與 sync-livestreams 共用）

// login（小寫）→ broadcaster_id
async function fetchTwitchUserIds(env, token, logins) {
    const map = new Map();
    for (let i = 0; i < logins.length; i += TWITCH_USER_BATCH) {
        const batch = logins.slice(i, i + TWITCH_USER_BATCH);
        const params = new URLSearchParams();
        for (const l of batch) params.append('login', l);
        const res = await fetch(`${TWITCH_USERS_URL}?${params.toString()}`, {
            headers: { 'Client-Id': env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`twitch users ${res.status}`);
        const data = await res.json();
        for (const u of data.data ?? []) {
            map.set(String(u.login).toLowerCase(), u.id);
        }
    }
    return map;
}

// broadcaster_id → follower total（app token 可拿 total，實測 OK）
async function fetchTwitchFollowerTotal(env, token, broadcasterId) {
    const res = await fetch(`${TWITCH_FOLLOWERS_URL}?broadcaster_id=${broadcasterId}&first=1`, {
        headers: { 'Client-Id': env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.total === 'number' ? data.total : null;
}

// ===== YouTube =====

async function fetchYouTubeSubs(env, channelIds) {
    const map = new Map();
    const ytHeaders = env.YOUTUBE_API_REFERER ? { Referer: env.YOUTUBE_API_REFERER } : {};
    for (let i = 0; i < channelIds.length; i += YT_BATCH) {
        const batch = channelIds.slice(i, i + YT_BATCH);
        const url = `${YT_CHANNELS_URL}?part=statistics&id=${batch.join(',')}&key=${env.YOUTUBE_API_KEY}`;
        const res = await fetch(url, { headers: ytHeaders });
        if (!res.ok) throw new Error(`youtube channels ${res.status}`);
        const data = await res.json();
        for (const item of data.items ?? []) {
            const subs = item?.statistics?.subscriberCount;
            if (subs != null) map.set(item.id, parseInt(subs, 10));
        }
    }
    return map;
}

// ===== helpers =====

// 本 ISO 週的週一 00:00 UTC（YouTube 每週一筆用）
function isoWeekStartUtc() {
    const now = new Date();
    const day = now.getUTCDay() || 7; // 週日 0 → 7
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)));
    return monday.toISOString();
}

// INSERT history；撞每日 unique（同日已記）回 409 → 視為成功 skip
async function insertSnapshot(env, vtuberId, platform, count) {
    const res = await insert(env, 'vtuber_subscriber_history', {
        vtuber_id: vtuberId,
        platform,
        subscriber_count: count,
    });
    return res.ok || res.status === 409;
}

// ===== Main handler =====

export async function onRequestPost(context) {
    const { request, env } = context;

    const auth = request.headers.get('Authorization') || '';
    if (!env.CRON_SHARED_SECRET || auth !== `Bearer ${env.CRON_SHARED_SECRET}`) {
        return jsonResponse({ success: false, error: 'unauthorized' }, 401, request);
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ success: false, error: 'supabase not configured' }, 500, request);
    }

    try {
        const vRes = await select(
            env,
            'vtubers?select=id,twitch_channel_id,youtube_channel_id&activity=eq.active',
        );
        if (!vRes.ok) {
            await logError(env, 'snapshot-subscribers', 'fetch vtubers failed', {
                metadata: { status: vRes.status, error: String(vRes.error || '').slice(0, 300) },
            });
            return jsonResponse({ success: false, error: 'fetch vtubers failed' }, 500, request);
        }
        const vtubers = vRes.data || [];

        let twitchUpdated = 0;
        let youtubeUpdated = 0;

        // ---- Twitch（日級精確） ----
        const twitchVtubers = vtubers.filter(v => v.twitch_channel_id);
        if (twitchVtubers.length > 0 && env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) {
            try {
                const token = await getTwitchAppToken(env);
                const logins = twitchVtubers.map(v => String(v.twitch_channel_id).toLowerCase());
                const idMap = await fetchTwitchUserIds(env, token, logins);
                for (const v of twitchVtubers) {
                    const bid = idMap.get(String(v.twitch_channel_id).toLowerCase());
                    if (!bid) continue;
                    const total = await fetchTwitchFollowerTotal(env, token, bid);
                    if (total == null) continue;
                    await update(env, 'vtubers', `id=eq.${encodeURIComponent(v.id)}`, { twitch_follower_count: total });
                    if (await insertSnapshot(env, v.id, 'twitch', total)) twitchUpdated++;
                }
            } catch (err) {
                await logError(env, 'snapshot-subscribers', 'twitch flow failed', {
                    metadata: { error: String(err).slice(0, 300) },
                });
            }
        }

        // ---- YouTube（週級，API 四捨五入） ----
        const ytVtubers = vtubers.filter(v => UC_RE.test(String(v.youtube_channel_id || '')));
        if (ytVtubers.length > 0 && env.YOUTUBE_API_KEY) {
            try {
                const subsMap = await fetchYouTubeSubs(env, ytVtubers.map(v => v.youtube_channel_id));
                const weekStart = isoWeekStartUtc();
                for (const v of ytVtubers) {
                    const subs = subsMap.get(v.youtube_channel_id);
                    if (subs == null) continue;
                    // 當前值每日刷新，讓卡片顯示最新
                    await update(env, 'vtubers', `id=eq.${encodeURIComponent(v.id)}`, { youtube_subscriber_count: subs });
                    // history 每 ISO 週只記一筆
                    const existing = await select(
                        env,
                        `vtuber_subscriber_history?vtuber_id=eq.${encodeURIComponent(v.id)}&platform=eq.youtube&recorded_at=gte.${encodeURIComponent(weekStart)}&limit=1`,
                    );
                    const hasThisWeek = existing.ok && Array.isArray(existing.data) && existing.data.length > 0;
                    if (!hasThisWeek && await insertSnapshot(env, v.id, 'youtube', subs)) youtubeUpdated++;
                }
            } catch (err) {
                await logError(env, 'snapshot-subscribers', 'youtube flow failed', {
                    metadata: { error: String(err).slice(0, 300) },
                });
            }
        }

        await logInfo(env, 'snapshot-subscribers', 'snapshot complete', {
            metadata: { vtubers: vtubers.length, twitch_snapshots: twitchUpdated, youtube_snapshots: youtubeUpdated },
        });

        return jsonResponse(
            { success: true, twitch_snapshots: twitchUpdated, youtube_snapshots: youtubeUpdated },
            200,
            request,
        );
    } catch (err) {
        await logError(env, 'snapshot-subscribers', 'unexpected error', {
            metadata: { error: String(err).slice(0, 300) },
        });
        return jsonResponse({ success: false, error: 'snapshot failed' }, 500, request);
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
