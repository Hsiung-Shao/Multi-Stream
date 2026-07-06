// Cloudflare Pages Function：每日訂閱數快照
//
// POST /api/cron/snapshot-subscribers
//   Authorization: Bearer ${CRON_SHARED_SECRET}
//
// 流程（每日觸發一次，實際工作在 context.waitUntil 背景執行，
// 立即回 202 避免拖過 pg_net 的 28s 逾時）：
//   Twitch：helix /users?login=batch 換 broadcaster_id → /channels/followers 拿 total（精確）
//           → UPDATE vtubers.twitch_follower_count + INSERT history（每日一筆，日級變化）
//   YouTube（vtubers 表）：channels.list?part=statistics&id=batch 拿 subscriberCount（API 四捨五入到 3 位有效）
//           → UPDATE vtubers.youtube_subscriber_count；history 每「ISO 週」只記一筆（週級變化）
//   YouTube（youtube_channels 全表快取，供搜尋排序/頻道卡片顯示用）：
//           對齊 scripts/enrich-youtube-channels.mjs 邏輯，channels.list?part=snippet,statistics
//           全表刷新頭像/訂閱數/觀看數/影片數等欄位，hiddenSubscriberCount 或未回傳時沿用舊值不抹 null。
//           與上面 vtubers 的 YouTube 抓取各自獨立呼叫（id 集合有重疊也各自查一次），
//           換取程式碼互不耦合、其中一邊出錯不影響另一邊；quota 成本使用者已確認可忽略不計。
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

// ===== youtube_channels 全表快取刷新（對齊 scripts/enrich-youtube-channels.mjs） =====
const YTC_SELECT_PAGE = 1000;
const YTC_UPSERT_BATCH = 500;
const YTC_API_SLEEP_MS = 200;
const YTC_TITLE_MAX = 200;
const YTC_DESC_MAX = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// 分頁抓 youtube_channels 全表現況（當「保留基準」：hidden/未回傳時沿用舊值）
async function fetchAllYoutubeChannels(env) {
    const rows = [];
    for (let offset = 0; ; offset += YTC_SELECT_PAGE) {
        const res = await select(
            env,
            `youtube_channels?select=channel_id,subscriber_count,view_count,video_count,thumbnail_url,fetched_at&order=channel_id.asc&limit=${YTC_SELECT_PAGE}&offset=${offset}`,
        );
        if (!res.ok) throw new Error(`select youtube_channels ${res.status}`);
        const page = res.data || [];
        rows.push(...page);
        if (page.length < YTC_SELECT_PAGE) break;
    }
    return rows;
}

async function fetchYoutubeChannelMetaBatch(env, ids) {
    const ytHeaders = env.YOUTUBE_API_REFERER ? { Referer: env.YOUTUBE_API_REFERER } : {};
    const url = `${YT_CHANNELS_URL}?part=snippet,statistics&maxResults=50&id=${ids.join(',')}&key=${env.YOUTUBE_API_KEY}`;
    const res = await fetch(url, { headers: ytHeaders });
    if (!res.ok) throw new Error(`youtube channels ${res.status}`);
    const data = await res.json();
    return data.items || [];
}

// 每筆欄位集必須一致，否則 PostgREST bulk upsert 會把缺的 key 當 NULL 寫入
function toChannelRow(item, base, nowIso) {
    const sn = item.snippet || {};
    const st = item.statistics || {};
    const th = sn.thumbnails || {};
    const thumb = th.high?.url || th.medium?.url || th.default?.url || base?.thumbnail_url || null;
    const title = (sn.title || '').trim().slice(0, YTC_TITLE_MAX) || item.id;

    let subs;
    if (st.hiddenSubscriberCount) subs = base?.subscriber_count ?? null;
    else if (st.subscriberCount != null) subs = st.subscriberCount;
    else subs = base?.subscriber_count ?? null;

    return {
        channel_id: item.id,
        channel_title: title,
        thumbnail_url: thumb,
        subscriber_count: subs,
        view_count: st.viewCount ?? base?.view_count ?? null,
        video_count: st.videoCount ?? base?.video_count ?? null,
        custom_url: sn.customUrl ?? null,
        description: (sn.description || '').slice(0, YTC_DESC_MAX) || null,
        published_at: sn.publishedAt ?? null,
        fetched_at: nowIso,
        updated_at: nowIso,
    };
}

// supabase-server.js 的 insert() 不支援 on_conflict/merge-duplicates，這裡照 sync-livestreams.js
// 的既有作法直接發 service_role request
async function upsertYoutubeChannelsBatch(env, rows) {
    const url = `${env.SUPABASE_URL}/rest/v1/youtube_channels?on_conflict=channel_id`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`upsert youtube_channels ${res.status}`);
}

async function refreshYoutubeChannelsCache(env) {
    if (!env.YOUTUBE_API_KEY) return;

    const all = await fetchAllYoutubeChannels(env);
    const baseMap = new Map(all.map((r) => [r.channel_id, r]));
    const ids = all.map((r) => r.channel_id);
    const nowIso = new Date().toISOString();
    const batches = chunk(ids, YT_BATCH);

    let updated = 0;
    let failedBatches = 0;
    for (let i = 0; i < batches.length; i++) {
        try {
            const items = await fetchYoutubeChannelMetaBatch(env, batches[i]);
            const rows = items.map((it) => toChannelRow(it, baseMap.get(it.id), nowIso));
            if (rows.length > 0) {
                for (const upsertBatch of chunk(rows, YTC_UPSERT_BATCH)) {
                    await upsertYoutubeChannelsBatch(env, upsertBatch);
                }
                updated += rows.length;
            }
        } catch (err) {
            failedBatches++;
            await logError(env, 'snapshot-subscribers', 'youtube_channels batch failed', {
                metadata: { batchIndex: i, error: String(err).slice(0, 300) },
            });
        }
        if (i < batches.length - 1) await sleep(YTC_API_SLEEP_MS);
    }

    await logInfo(env, 'snapshot-subscribers', 'youtube_channels refresh complete', {
        metadata: { total: ids.length, updated, failed_batches: failedBatches },
    });
}

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

    // 實際工作丟到背景執行，立即回應 pg_net（避免 vtubers + youtube_channels 兩段
    // 加總後的執行時間拖過 pg_net 的 28s 逾時；結果一律看 system_logs）
    context.waitUntil(runSnapshot(env));

    return jsonResponse({ success: true, accepted: true }, 202, request);
}

async function runSnapshot(env) {
    // vtubers 流程與 youtube_channels 全表刷新是兩個獨立區塊，
    // 分開呼叫確保其中一個 early return/例外不會連帶跳過另一個
    await runVtuberSnapshot(env);

    try {
        await refreshYoutubeChannelsCache(env);
    } catch (err) {
        await logError(env, 'snapshot-subscribers', 'youtube_channels refresh failed', {
            metadata: { error: String(err).slice(0, 300) },
        });
    }
}

async function runVtuberSnapshot(env) {
    try {
        const vRes = await select(
            env,
            'vtubers?select=id,twitch_channel_id,youtube_channel_id&activity=eq.active',
        );
        if (!vRes.ok) {
            await logError(env, 'snapshot-subscribers', 'fetch vtubers failed', {
                metadata: { status: vRes.status, error: String(vRes.error || '').slice(0, 300) },
            });
            return;
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
    } catch (err) {
        await logError(env, 'snapshot-subscribers', 'unexpected error', {
            metadata: { error: String(err).slice(0, 300) },
        });
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
