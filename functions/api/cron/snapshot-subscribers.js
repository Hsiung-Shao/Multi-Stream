// Cloudflare Pages Function：每日訂閱數快照（YouTube）
//
// POST /api/cron/snapshot-subscribers
//   Authorization: Bearer ${CRON_SHARED_SECRET}
//
// 流程（每日觸發一次，實際工作在 context.waitUntil 背景執行，
// 立即回 202 避免拖過 pg_net 的 28s 逾時）：
//   YouTube（vtubers 表）：channels.list?part=statistics&id=batch 拿 subscriberCount（API 四捨五入到 3 位有效）
//           → 批次 upsert vtubers.youtube_subscriber_count；history 每「ISO 週」只記一筆（週級變化）
//   YouTube（youtube_channels 全表快取，供搜尋排序/頻道卡片顯示用）：
//           對齊 scripts/enrich-youtube-channels.mjs 邏輯，channels.list?part=snippet,statistics
//           全表刷新頭像/訂閱數/觀看數/影片數等欄位，hiddenSubscriberCount 或未回傳時沿用舊值不抹 null。
//
// Twitch 訂閱數快照拆到 functions/api/cron/snapshot-twitch-followers.js（獨立、高頻排程）：
// Twitch /channels/followers 沒有批次端點、每個頻道要各打一次 API，目前規模下
// (1300+ 個啟用中的 Twitch vtuber）若跟 YouTube 放同一次呼叫，單次 subrequest 數會
// 遠超 Cloudflare 每次呼叫的上限；拆開後 Twitch 用分片＋高頻排程慢慢輪完整批。
//
// 全程改用批次 upsert（functions/lib/supabase-server.js 的 upsert()）取代逐筆
// update/insert，把「每個 vtuber 各打幾次 Supabase API」壓到「整批幾次」。
//
// 環境變數：
//   CRON_SHARED_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   YOUTUBE_API_KEY（選 YOUTUBE_API_REFERER：key 有 HTTP referer 限制時需帶）

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { select, insert, upsert } from '../../lib/supabase-server.js';
import { logError, logInfo } from '../../lib/logger.js';

const YT_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';
const UC_RE = /^UC[A-Za-z0-9_-]{22}$/;
const YT_BATCH = 50;    // channels.list 一次最多 50 個 id
const DB_BATCH = 300;   // PostgREST 單批 upsert/查詢筆數上限（也用於 in.() 過濾，避免 URL 過長）

const YTC_SELECT_PAGE = 1000;
const YTC_API_SLEEP_MS = 200;
const YTC_TITLE_MAX = 200;
const YTC_DESC_MAX = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function fetchYoutubeChannelMetaBatch(env, ids, part) {
    const ytHeaders = env.YOUTUBE_API_REFERER ? { Referer: env.YOUTUBE_API_REFERER } : {};
    const url = `${YT_CHANNELS_URL}?part=${part}&maxResults=50&id=${ids.join(',')}&key=${env.YOUTUBE_API_KEY}`;
    const res = await fetch(url, { headers: ytHeaders });
    if (!res.ok) throw new Error(`youtube channels ${res.status}`);
    const data = await res.json();
    return data.items || [];
}

// ===== youtube_channels 全表快取刷新（對齊 scripts/enrich-youtube-channels.mjs） =====

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

// 每筆欄位集必須一致，否則 PostgREST bulk upsert 會把缺的 key 當 NULL 寫入
function toChannelRow(item, base, nowIso) {
    const sn = item.snippet || {};
    const st = item.statistics || {};
    const th = sn.thumbnails || {};
    const thumb = th.high?.url || th.medium?.url || th.default?.url || base?.thumbnail_url || null;
    const title = (sn.title || '').trim().slice(0, YTC_TITLE_MAX) || item.id;

    // 訂閱數/觀看數/影片數：隱藏或未回傳則沿用舊值，不抹成 null
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
            const items = await fetchYoutubeChannelMetaBatch(env, batches[i], 'snippet,statistics');
            const rows = items.map((it) => toChannelRow(it, baseMap.get(it.id), nowIso));
            if (rows.length > 0) {
                const res = await upsert(env, 'youtube_channels', rows, { onConflict: 'channel_id' });
                if (!res.ok) throw new Error(`upsert youtube_channels ${res.status}`);
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

    const log = failedBatches > 0 ? logError : logInfo;
    await log(env, 'snapshot-subscribers', 'youtube_channels refresh complete', {
        metadata: { total: ids.length, updated, failed_batches: failedBatches },
    });
}

// ===== vtubers 表的 YouTube 訂閱數（全程批次寫入，避免逐筆呼叫撞 subrequest 上限） =====

// 本 ISO 週的週一 00:00 UTC（history 每週一筆用）
function isoWeekStartUtc() {
    const now = new Date();
    const day = now.getUTCDay() || 7; // 週日 0 → 7
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)));
    return monday.toISOString();
}

// 批次查「這批 vtuber 中，本週(youtube)/今日(twitch 共用同一張表) 已經記錄過的 vtuber_id」
// vtuber_subscriber_history 的唯一索引是 date 運算式索引，PostgREST 的 on_conflict 無法
// 直接對應到運算式索引，因此用「先查已記錄、只 insert 剩下的」取代 upsert-with-on-conflict
async function fetchAlreadyRecorded(env, vtuberIds, platform, sinceIso) {
    const recorded = new Set();
    for (const batch of chunk(vtuberIds, DB_BATCH)) {
        const idList = batch.map((id) => encodeURIComponent(id)).join(',');
        const res = await select(
            env,
            `vtuber_subscriber_history?vtuber_id=in.(${idList})&platform=eq.${platform}&recorded_at=gte.${encodeURIComponent(sinceIso)}&select=vtuber_id`,
        );
        if (res.ok) {
            for (const row of res.data || []) recorded.add(row.vtuber_id);
        }
    }
    return recorded;
}

async function runYoutubeVtuberSnapshot(env) {
    const vRes = await select(env, 'vtubers?select=id,youtube_channel_id&activity=eq.active');
    if (!vRes.ok) {
        await logError(env, 'snapshot-subscribers', 'fetch vtubers failed', {
            metadata: { status: vRes.status, error: String(vRes.error || '').slice(0, 300) },
        });
        return;
    }
    const ytVtubers = (vRes.data || []).filter((v) => UC_RE.test(String(v.youtube_channel_id || '')));
    if (ytVtubers.length === 0 || !env.YOUTUBE_API_KEY) return;

    // 1) 批次拿訂閱數
    const subsMap = new Map();
    for (const idsBatch of chunk(ytVtubers.map((v) => v.youtube_channel_id), YT_BATCH)) {
        try {
            const items = await fetchYoutubeChannelMetaBatch(env, idsBatch, 'statistics');
            for (const item of items) {
                const subs = item?.statistics?.subscriberCount;
                if (subs != null) subsMap.set(item.id, parseInt(subs, 10));
            }
        } catch (err) {
            await logError(env, 'snapshot-subscribers', 'youtube subs batch failed', {
                metadata: { error: String(err).slice(0, 300) },
            });
        }
    }

    const withSubs = ytVtubers
        .map((v) => ({ id: v.id, subs: subsMap.get(v.youtube_channel_id) }))
        .filter((v) => v.subs != null);
    if (withSubs.length === 0) return;

    // 2) 批次 upsert vtubers.youtube_subscriber_count（當前值每日刷新，讓卡片顯示最新）
    let vtuberUpdated = 0;
    for (const batch of chunk(withSubs, DB_BATCH)) {
        const rows = batch.map((v) => ({ id: v.id, youtube_subscriber_count: v.subs }));
        const res = await upsert(env, 'vtubers', rows, { onConflict: 'id' });
        if (res.ok) vtuberUpdated += rows.length;
        else {
            await logError(env, 'snapshot-subscribers', 'vtubers youtube_subscriber_count upsert failed', {
                metadata: { status: res.status, error: String(res.error || '').slice(0, 300) },
            });
        }
    }

    // 3) history 每 ISO 週只記一筆：先批次查本週已記錄的 vtuber_id，只對剩下的批次 insert
    const weekStart = isoWeekStartUtc();
    const alreadyRecorded = await fetchAlreadyRecorded(env, withSubs.map((v) => v.id), 'youtube', weekStart);
    const toRecord = withSubs.filter((v) => !alreadyRecorded.has(v.id));

    let youtubeSnapshots = 0;
    for (const batch of chunk(toRecord, DB_BATCH)) {
        const rows = batch.map((v) => ({ vtuber_id: v.id, platform: 'youtube', subscriber_count: v.subs }));
        const res = await insert(env, 'vtuber_subscriber_history', rows);
        if (res.ok) youtubeSnapshots += rows.length;
        else {
            // 罕見情況（例如跟其他觸發撞到同週唯一索引）：整批失敗只記錯誤，
            // 下週的 alreadyRecorded 檢查會再自然涵蓋，不影響訂閱數本身的更新
            await logError(env, 'snapshot-subscribers', 'vtuber_subscriber_history insert failed', {
                metadata: { status: res.status, error: String(res.error || '').slice(0, 300) },
            });
        }
    }

    await logInfo(env, 'snapshot-subscribers', 'youtube vtuber snapshot complete', {
        metadata: {
            active_youtube_vtubers: ytVtubers.length,
            vtuber_updated: vtuberUpdated,
            youtube_snapshots: youtubeSnapshots,
        },
    });
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

    // 實際工作丟到背景執行，立即回應 pg_net（避免兩段加總後的執行時間拖過
    // pg_net 的 28s 逾時；結果一律看 system_logs）
    context.waitUntil(runSnapshot(env));

    return jsonResponse({ success: true, accepted: true }, 202, request);
}

async function runSnapshot(env) {
    // vtubers 訂閱數與 youtube_channels 全表刷新是兩個獨立區塊，
    // 分開呼叫確保其中一個例外不會連帶跳過另一個
    try {
        await runYoutubeVtuberSnapshot(env);
    } catch (err) {
        await logError(env, 'snapshot-subscribers', 'youtube vtuber snapshot failed', {
            metadata: { error: String(err).slice(0, 300) },
        });
    }

    try {
        await refreshYoutubeChannelsCache(env);
    } catch (err) {
        await logError(env, 'snapshot-subscribers', 'youtube_channels refresh failed', {
            metadata: { error: String(err).slice(0, 300) },
        });
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
