// GET /api/vtubers/search?q=<displayName>&limit=5
//
// 用 pg_trgm similarity() 對 vtubers.name 模糊比對,回傳 top N 候選 + 累積推薦數。
// 用於推薦 Dialog 的「您是不是這位?」suggestion。
//
// 公開可查(不需登入)— 純讀取,只暴露公開頻道 metadata。
// 走 search_vtubers RPC(SECURITY DEFINER,跨平台都比),不直接打 PostgREST filter。
//
// 參數驗證:
//   q     必填,1-100 字
//   limit 選填,1-10,預設 5
//
// 回應:
//   200 { ok: true, results: [{ id, name, youtube_channel_id, twitch_channel_id,
//                               img_url, languages, score, recommend_count }] }
//   400 { ok: false, error: 'invalid_query' | 'invalid_limit' }
//   500 { ok: false, error: 'search_failed' | 'server_misconfigured' }

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { rpc } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';

const Q_MAX_LEN = 100;
const Q_MIN_LEN = 1;
const LIMIT_DEFAULT = 5;
const LIMIT_MAX = 10;
const MIN_SIMILARITY = 0.25;

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < Q_MIN_LEN || q.length > Q_MAX_LEN) {
        return jsonResponse({ ok: false, error: 'invalid_query' }, 400, request);
    }

    const limitRaw = url.searchParams.get('limit');
    let limit = LIMIT_DEFAULT;
    if (limitRaw !== null) {
        const n = parseInt(limitRaw, 10);
        if (!Number.isFinite(n) || n < 1 || n > LIMIT_MAX) {
            return jsonResponse({ ok: false, error: 'invalid_limit' }, 400, request);
        }
        limit = n;
    }

    const result = await rpc(env, 'search_vtubers', {
        q,
        lim: limit,
        min_similarity: MIN_SIMILARITY,
    });

    if (!result.ok) {
        await logError(env, 'vtubers-search', 'rpc failed', {
            metadata: { status: result.status, error: String(result.error || '').slice(0, 300), q_len: q.length },
        });
        return jsonResponse({ ok: false, error: 'search_failed' }, 500, request);
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    return jsonResponse(
        { ok: true, results: rows },
        200,
        request,
        // 同 q 短時間內反覆查(user 微調輸入)走 CDN cache 一點點 — 但 q 是公開可查
        // 任意內容,設低 max-age 避免 user-facing cache 污染
        { 'Cache-Control': 'public, max-age=30' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
