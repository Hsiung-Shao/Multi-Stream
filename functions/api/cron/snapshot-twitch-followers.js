// Cloudflare Pages Function：Twitch 訂閱數（follower）分片快照
//
// POST /api/cron/snapshot-twitch-followers
//   Authorization: Bearer ${CRON_SHARED_SECRET}
//
// 為什麼拆成獨立 cron（而非併入 snapshot-subscribers.js）：
// Twitch `/channels/followers` 沒有批次端點，每個頻道都要各打一次 API（不像
// YouTube channels.list 一次能查 50 個 id）。目前規模（1300+ 個啟用中的 Twitch
// vtuber）下，若在單次呼叫內處理完全部，subrequest 數量會遠超過 Cloudflare
// 每次呼叫的上限。因此改成「分片」：每次只處理一小批（SHARD_SIZE），用 KV
// 記錄游標（cursor），下次從游標處繼續，環狀輪完整批 vtuber 清單。
//
// 排程建議：比 snapshot-subscribers.js（每日一次）更高頻，例如每 20 分鐘一次，
// 確保整批 vtuber 在一天內能被輪到至少一次（隨 vtuber 數量成長，頻率/分片大小
// 需要一併調整）。
//
// 環境變數：
//   CRON_SHARED_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET
//   RATE_LIMIT_KV（binding，與 lib/twitch-token.js 共用；游標也存在這裡）

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { select, insert, upsert } from '../../lib/supabase-server.js';
import { logError, logInfo } from '../../lib/logger.js';
import { getTwitchAppToken } from '../../lib/twitch-token.js';

const TWITCH_USERS_URL = 'https://api.twitch.tv/helix/users';
const TWITCH_FOLLOWERS_URL = 'https://api.twitch.tv/helix/channels/followers';
const TWITCH_USER_BATCH = 100; // helix /users 一次最多 100 個 login
const DB_BATCH = 300;          // PostgREST 單批 upsert/insert/in.() 過濾筆數上限
const SHARD_SIZE = 200;        // 每次處理的 vtuber 數（含 follower 查詢的 subrequest 數上限）
const CURSOR_KV_KEY = 'snapshot_twitch_cursor';

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function getCursor(env) {
    if (!env.RATE_LIMIT_KV) return 0;
    try {
        const n = parseInt(await env.RATE_LIMIT_KV.get(CURSOR_KV_KEY), 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
        return 0;
    }
}

async function saveCursor(env, cursor) {
    if (!env.RATE_LIMIT_KV) return;
    try {
        await env.RATE_LIMIT_KV.put(CURSOR_KV_KEY, String(cursor));
    } catch {
        // 存失敗下次從 0 開始重跑，不影響正確性，只是覆蓋率暫時受影響
    }
}

// login（小寫）→ broadcaster_id
async function fetchTwitchUserIds(env, token, logins) {
    const map = new Map();
    for (const batch of chunk(logins, TWITCH_USER_BATCH)) {
        const params = new URLSearchParams();
        for (const l of batch) params.append('login', l);
        const res = await fetch(`${TWITCH_USERS_URL}?${params.toString()}`, {
            headers: { 'Client-Id': env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`twitch users ${res.status}`);
        const data = await res.json();
        for (const u of data.data ?? []) map.set(String(u.login).toLowerCase(), u.id);
    }
    return map;
}

// broadcaster_id → follower total（app token 可拿 total，實測 OK；無批次端點，一次一個頻道）
async function fetchTwitchFollowerTotal(env, token, broadcasterId) {
    const res = await fetch(`${TWITCH_FOLLOWERS_URL}?broadcaster_id=${broadcasterId}&first=1`, {
        headers: { 'Client-Id': env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.total === 'number' ? data.total : null;
}

// 批次查「這批 vtuber 中，今天已經記錄過 twitch 快照的 vtuber_id」
// vtuber_subscriber_history 的唯一索引是 date 運算式索引，PostgREST 的 on_conflict
// 無法直接對應到運算式索引，因此用「先查已記錄、只 insert 剩下的」取代 upsert-with-on-conflict
async function fetchAlreadyRecordedToday(env, vtuberIds) {
    const todayStartUtc = new Date();
    todayStartUtc.setUTCHours(0, 0, 0, 0);
    const sinceIso = todayStartUtc.toISOString();

    const recorded = new Set();
    for (const batch of chunk(vtuberIds, DB_BATCH)) {
        const idList = batch.map((id) => encodeURIComponent(id)).join(',');
        const res = await select(
            env,
            `vtuber_subscriber_history?vtuber_id=in.(${idList})&platform=eq.twitch&recorded_at=gte.${encodeURIComponent(sinceIso)}&select=vtuber_id`,
        );
        if (res.ok) {
            for (const row of res.data || []) recorded.add(row.vtuber_id);
        }
    }
    return recorded;
}

async function runTwitchShardSnapshot(env) {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return;

    const vRes = await select(env, 'vtubers?select=id,twitch_channel_id&activity=eq.active&order=id.asc');
    if (!vRes.ok) {
        await logError(env, 'snapshot-twitch-followers', 'fetch vtubers failed', {
            metadata: { status: vRes.status, error: String(vRes.error || '').slice(0, 300) },
        });
        return;
    }
    const twitchVtubers = (vRes.data || []).filter((v) => v.twitch_channel_id);
    if (twitchVtubers.length === 0) return;

    // 環狀分片：從游標處取 SHARD_SIZE 個，超過陣列尾端就繞回開頭
    const cursor = await getCursor(env);
    const start = cursor % twitchVtubers.length;
    const shardLen = Math.min(SHARD_SIZE, twitchVtubers.length);
    const shard = [];
    for (let i = 0; i < shardLen; i++) shard.push(twitchVtubers[(start + i) % twitchVtubers.length]);
    await saveCursor(env, start + shardLen);

    const token = await getTwitchAppToken(env);
    const logins = shard.map((v) => String(v.twitch_channel_id).toLowerCase());
    const idMap = await fetchTwitchUserIds(env, token, logins);

    const withTotal = [];
    for (const v of shard) {
        const bid = idMap.get(String(v.twitch_channel_id).toLowerCase());
        if (!bid) continue;
        const total = await fetchTwitchFollowerTotal(env, token, bid);
        if (total != null) withTotal.push({ id: v.id, total });
    }
    if (withTotal.length === 0) return;

    // 批次 upsert vtubers.twitch_follower_count（id 為真實 PK，PostgREST on_conflict 可直接對應）
    let vtuberUpdated = 0;
    for (const batch of chunk(withTotal, DB_BATCH)) {
        const rows = batch.map((v) => ({ id: v.id, twitch_follower_count: v.total }));
        const res = await upsert(env, 'vtubers', rows, { onConflict: 'id' });
        if (res.ok) vtuberUpdated += rows.length;
        else {
            await logError(env, 'snapshot-twitch-followers', 'vtubers twitch_follower_count upsert failed', {
                metadata: { status: res.status, error: String(res.error || '').slice(0, 300) },
            });
        }
    }

    // history 每日一筆：先查今天已記錄的，只對剩下的批次 insert
    const alreadyRecorded = await fetchAlreadyRecordedToday(env, withTotal.map((v) => v.id));
    const toRecord = withTotal.filter((v) => !alreadyRecorded.has(v.id));

    let snapshots = 0;
    for (const batch of chunk(toRecord, DB_BATCH)) {
        const rows = batch.map((v) => ({ vtuber_id: v.id, platform: 'twitch', subscriber_count: v.total }));
        const res = await insert(env, 'vtuber_subscriber_history', rows);
        if (res.ok) snapshots += rows.length;
        else {
            await logError(env, 'snapshot-twitch-followers', 'vtuber_subscriber_history insert failed', {
                metadata: { status: res.status, error: String(res.error || '').slice(0, 300) },
            });
        }
    }

    await logInfo(env, 'snapshot-twitch-followers', 'shard complete', {
        metadata: {
            total_active: twitchVtubers.length,
            shard_start: start,
            shard_size: shard.length,
            vtuber_updated: vtuberUpdated,
            snapshots,
        },
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const auth = request.headers.get('Authorization') || '';
    if (!env.CRON_SHARED_SECRET || auth !== `Bearer ${env.CRON_SHARED_SECRET}`) {
        return jsonResponse({ success: false, error: 'unauthorized' }, 401, request);
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ success: false, error: 'supabase not configured' }, 500, request);
    }

    context.waitUntil(
        runTwitchShardSnapshot(env).catch((err) =>
            logError(env, 'snapshot-twitch-followers', 'unexpected error', {
                metadata: { error: String(err).slice(0, 300) },
            }),
        ),
    );

    return jsonResponse({ success: true, accepted: true }, 202, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
