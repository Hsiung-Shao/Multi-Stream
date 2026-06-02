// GET /api/livestreams
//
// 回傳目前所有「現正直播」清單（vtuber_livestreams + 對應 vtuber metadata）。
// 給 RecommendationsPage 的 LiveNowCarousel 用。
//
// 資料由 /api/cron/sync-livestreams 每 2 分鐘整表 swap 寫入；
// 此 endpoint 純讀，走 select() service_role 繞 RLS（公開直播狀態）。
//
// 回應：
//   200 { ok: true, livestreams: [...] }
//   500 { ok: false, error: 'fetch_failed' | 'server_misconfigured' }

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { select } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';

// PostgREST embedding：靠 vtuber_livestreams_vtuber_id_fkey 帶出 vtuber metadata
const SELECT_FIELDS = [
    'id',
    'title',
    'video_url',
    'thumbnail_url',
    'platform',
    'start_time',
    'viewer_count',
    'vtuber:vtubers(id,name,img_url,youtube_channel_id,twitch_channel_id)',
].join(',');

const MAX_ROWS = 30;

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    // viewer_count DESC nullslast → Twitch（有觀看數）在前、YouTube（null）在後，再依 start_time 新→舊
    const res = await select(
        env,
        `vtuber_livestreams?select=${SELECT_FIELDS}` +
            `&order=viewer_count.desc.nullslast,start_time.desc.nullslast` +
            `&limit=${MAX_ROWS}`,
    );

    if (!res.ok) {
        await logError(env, 'livestreams', 'fetch livestreams failed', {
            metadata: { status: res.status, error: String(res.error || '').slice(0, 300) },
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }

    // 過濾掉 vtuber 已被刪的孤兒（理論上 FK CASCADE 不會有，保險）
    const livestreams = Array.isArray(res.data)
        ? res.data.filter(row => row && row.vtuber)
        : [];

    return jsonResponse(
        { ok: true, livestreams },
        200,
        request,
        // 直播狀態變動快，但來源 cron 每 2 分鐘更新；短快取 + SWR
        { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
