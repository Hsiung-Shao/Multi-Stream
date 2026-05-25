// GET /api/vtubers/<uuid>
//
// 取單一 vtuber 完整資料,給 VtuberDetailPage 用。
// 一次回:vtuber metadata + 累積推薦數 + approved categories。
//
// 公開可查(anon OK),純讀 public 資料。
// 走既有 select() helper(service_role 繞 RLS),不寫新 RPC。
//
// 回應:
//   200 { ok: true, vtuber: { ..., recommend_count, categories[] } | null }
//   400 { ok: false, error: 'invalid_id' }
//   500 { ok: false, error: 'fetch_failed' | 'server_misconfigured' }

import { jsonResponse, handleOptions } from '../../../lib/cors.js';
import { select } from '../../../lib/supabase-server.js';
import { logError } from '../../../lib/logger.js';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const VTUBER_FIELDS = [
    'id',
    'name',
    'img_url',
    'nationality',
    'activity',
    'group_id',
    'youtube_channel_id',
    'youtube_subscriber_count',
    'twitch_channel_id',
    'twitch_follower_count',
    'languages',
    'debut_date',
].join(',');

export async function onRequestGet(context) {
    const { request, env, params } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const id = params?.id;
    if (!id || !UUID_RE.test(id)) {
        return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
    }

    // 並行 3 個 fetch(主 / count / categories)
    const [vtuberRes, recRes, tagsRes] = await Promise.all([
        select(env, `vtubers?id=eq.${encodeURIComponent(id)}&select=${VTUBER_FIELDS}&limit=1`),
        select(env, `vtuber_recommendations?vtuber_id=eq.${encodeURIComponent(id)}&select=id`),
        select(env, `vtuber_category_tags?vtuber_id=eq.${encodeURIComponent(id)}&select=category:vtuber_categories(id,name,slug,status)`),
    ]);

    if (!vtuberRes.ok) {
        await logError(env, 'vtubers-by-id', 'fetch vtuber failed', {
            metadata: { status: vtuberRes.status, error: String(vtuberRes.error || '').slice(0, 300), id },
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }

    const vtuberRow = Array.isArray(vtuberRes.data) && vtuberRes.data.length > 0
        ? vtuberRes.data[0]
        : null;
    if (!vtuberRow) {
        return jsonResponse({ ok: true, vtuber: null }, 200, request, { 'Cache-Control': 'public, max-age=60' });
    }

    // 次要 fetch failure 不影響主要回應,但要 log 方便排查
    const recommendCount = recRes.ok && Array.isArray(recRes.data) ? recRes.data.length : 0;
    if (!recRes.ok) {
        await logError(env, 'vtubers-by-id', 'count recommendations failed', {
            metadata: { status: recRes.status, error: String(recRes.error || '').slice(0, 200), id },
        });
    }

    let categories = [];
    if (tagsRes.ok && Array.isArray(tagsRes.data)) {
        categories = tagsRes.data
            .map(t => t.category)
            .filter(c => c && c.status === 'approved')
            .map(c => ({ id: c.id, name: c.name, slug: c.slug }));
    } else if (!tagsRes.ok) {
        await logError(env, 'vtubers-by-id', 'fetch categories failed', {
            metadata: { status: tagsRes.status, error: String(tagsRes.error || '').slice(0, 200), id },
        });
    }

    return jsonResponse(
        {
            ok: true,
            vtuber: {
                ...vtuberRow,
                recommend_count: recommendCount,
                categories,
            },
        },
        200,
        request,
        { 'Cache-Control': 'public, max-age=60' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
