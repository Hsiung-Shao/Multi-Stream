// Cloudflare Pages Function: 後端 YouTube 頻道 cache 寫入端點
//
// 目的：
//   - 取代前端直接 `supabase.from('youtube_channels').upsert(...)` 的寫入路徑
//   - 為 RLS hardening 鋪路 — 之後 youtube_channels INSERT/UPDATE 將只允許 service_role
//   - 寫入流程完全在 server side：authenticated user 只傳 channel_id，後端去呼叫
//     YouTube Data API 抓 metadata 並 upsert 到 youtube_channels
//
// 流程：
//   1. 驗證 caller 為 authenticated user（任何 trust_level 都允許）
//   2. 驗證 channel_id 格式（UC + 22 字元）
//   3. 呼叫 YouTube Data API channels.list (part=snippet,statistics)
//   4. 用 SERVICE_ROLE 走 PostgREST upsert（onConflict=channel_id）
//
// 注意：
//   - 不寫 last_live_*：channels.list 不含直播資訊，這些欄位由其他流程（cron / live-detect）填
//   - description 截斷到 1000 字元，避免異常長字串放大 row size
//   - 失敗不阻塞前端流程，前端視為「cache 未寫入」即可

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';

const CHANNEL_ID_REGEX = /^UC[A-Za-z0-9_-]{22}$/;
const DESC_MAX_LEN = 1000;

function toIntOrNull(v) {
    if (v === undefined || v === null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
}

function pickThumbnail(snippet) {
    const t = snippet?.thumbnails || {};
    return t.high?.url || t.medium?.url || t.default?.url || null;
}

export async function onRequestPost(context) {
    const { request, env } = context;

    // 1. 驗證 authenticated（任何登入 user 都可觸發 cache 寫入）
    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ ok: false, reason: 'unauthenticated' }, 401, request);
    }

    // 2. 解析與驗證 input
    let body = null;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ ok: false, reason: 'invalid_json' }, 400, request);
    }
    const channelId = body?.channel_id;
    if (typeof channelId !== 'string' || !CHANNEL_ID_REGEX.test(channelId)) {
        return jsonResponse({ ok: false, reason: 'invalid_channel_id' }, 400, request);
    }

    // 3. 呼叫 YouTube Data API
    const apiKey = env?.YOUTUBE_API_KEY;
    if (!apiKey) {
        return jsonResponse({ ok: false, reason: 'server_misconfigured' }, 500, request);
    }
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, reason: 'server_misconfigured' }, 500, request);
    }

    const ytUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`;

    let ytData = null;
    try {
        const ytRes = await fetch(ytUrl, { method: 'GET' });
        if (!ytRes.ok) {
            return jsonResponse(
                { ok: false, reason: 'youtube_api_error', status: ytRes.status },
                502,
                request,
            );
        }
        ytData = await ytRes.json();
    } catch {
        return jsonResponse({ ok: false, reason: 'youtube_api_error' }, 502, request);
    }

    if (!ytData?.items || ytData.items.length === 0) {
        return jsonResponse({ ok: false, reason: 'channel_not_found' }, 404, request);
    }

    const item = ytData.items[0];
    const snippet = item.snippet || {};
    const stats = item.statistics || {};

    // 4. 組 cache row（last_live_* 不在此處填）
    const cacheRow = {
        channel_id: item.id,
        channel_title: typeof snippet.title === 'string' ? snippet.title : '',
        thumbnail_url: pickThumbnail(snippet),
        subscriber_count: toIntOrNull(stats.subscriberCount),
        view_count: toIntOrNull(stats.viewCount),
        video_count: toIntOrNull(stats.videoCount),
        description: typeof snippet.description === 'string'
            ? snippet.description.slice(0, DESC_MAX_LEN)
            : null,
        custom_url: typeof snippet.customUrl === 'string' ? snippet.customUrl : null,
        published_at: typeof snippet.publishedAt === 'string' ? snippet.publishedAt : null,
        fetched_at: new Date().toISOString(),
    };

    // 5. 用 SERVICE_ROLE 走 PostgREST upsert
    //
    // PostgREST upsert pattern：POST 到 table + Prefer: resolution=merge-duplicates
    // 需要 on_conflict 指定衝突欄位
    const upsertUrl = `${env.SUPABASE_URL}/rest/v1/youtube_channels?on_conflict=channel_id`;
    let dbRes;
    try {
        dbRes = await fetch(upsertUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Prefer': 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(cacheRow),
        });
    } catch {
        return jsonResponse({ ok: false, reason: 'db_error' }, 500, request);
    }

    if (!dbRes.ok) {
        // 不洩漏完整 error 內文給 client（可能包含 schema 細節），但保留 status 供 debug
        return jsonResponse(
            { ok: false, reason: 'db_error', status: dbRes.status },
            500,
            request,
        );
    }

    return jsonResponse({ ok: true, channel: cacheRow }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
