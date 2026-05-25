// GET /api/vtubers/by-channel?platform=twitch|youtube&channel_id=<id>
//
// 用 (platform, channelId) 精確查 vtuber + 累積推薦數。
// RecommendDialog 用來判斷主推頻道是否已在 db、是否已連結另一平台,以決定
// 是否隱藏 cross URL 輸入框與 suggestion list。
//
// 公開可查(不需登入)— 純讀取,只暴露公開頻道 metadata。
// 走 get_vtuber_by_channel RPC(SECURITY DEFINER),不直接打 PostgREST filter。
//
// 參數驗證:
//   platform    必填,'twitch' | 'youtube'
//   channel_id  必填,1-100 字
//
// 回應:
//   200 { ok: true, vtuber: { id, name, youtube_channel_id, twitch_channel_id,
//                              img_url, languages, recommend_count } | null }
//   400 { ok: false, error: 'invalid_platform' | 'invalid_channel_id' }
//   500 { ok: false, error: 'lookup_failed' | 'server_misconfigured' }

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { rpc } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';

const CHANNEL_ID_MAX_LEN = 100;
const CHANNEL_ID_MIN_LEN = 1;
const ALLOWED_PLATFORMS = new Set(['twitch', 'youtube']);

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const url = new URL(request.url);
    const platform = (url.searchParams.get('platform') || '').trim().toLowerCase();
    if (!ALLOWED_PLATFORMS.has(platform)) {
        return jsonResponse({ ok: false, error: 'invalid_platform' }, 400, request);
    }

    const channelId = (url.searchParams.get('channel_id') || '').trim();
    if (channelId.length < CHANNEL_ID_MIN_LEN || channelId.length > CHANNEL_ID_MAX_LEN) {
        return jsonResponse({ ok: false, error: 'invalid_channel_id' }, 400, request);
    }

    const result = await rpc(env, 'get_vtuber_by_channel', {
        p_platform: platform,
        p_channel_id: channelId,
    });

    if (!result.ok) {
        await logError(env, 'vtubers-by-channel', 'rpc failed', {
            metadata: {
                status: result.status,
                error: String(result.error || '').slice(0, 300),
                platform,
                cid_len: channelId.length,
            },
        });
        return jsonResponse({ ok: false, error: 'lookup_failed' }, 500, request);
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    const vtuber = rows.length > 0 ? rows[0] : null;

    return jsonResponse(
        { ok: true, vtuber },
        200,
        request,
        // 資料變動慢,給 60s CDN cache 即可
        { 'Cache-Control': 'public, max-age=60' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
