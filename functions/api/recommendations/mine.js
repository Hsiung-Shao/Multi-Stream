// GET /api/recommendations/mine
// 列 user 自己所有推薦(raw rows,含 vtuber metadata),供「我的推薦」tab 用。
//
// 需登入(401 if no userId)。
// 預設 ORDER BY created_at DESC LIMIT 100(V1 不分頁,user 自己的推薦不會多到爆)

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { select } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';

const HARD_LIMIT = 100;

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ ok: false, error: 'unauthenticated' }, 401, request);
    }

    const filters = [
        'select=id,vtuber_id,comment,created_at',
        `user_id=eq.${encodeURIComponent(userId)}`,
        'order=created_at.desc',
        `limit=${HARD_LIMIT}`,
    ];

    const res = await select(env, `vtuber_recommendations?${filters.join('&')}`);
    if (!res.ok) {
        await logError(env, 'recommendations-mine', 'list failed', {
            userId,
            metadata: { status: res.status, error: res.error?.slice(0, 500) },
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }

    const rows = res.data || [];
    if (rows.length === 0) {
        return jsonResponse({ ok: true, items: [] }, 200, request, { 'Cache-Control': 'no-store' });
    }

    // 拉 vtuber metadata
    const vtuberIds = [...new Set(rows.map(r => r.vtuber_id))];
    const inClause = vtuberIds.map(id => encodeURIComponent(id)).join(',');
    const vRes = await select(
        env,
        `vtubers?id=in.(${inClause})&select=id,name,img_url,nationality,activity,youtube_channel_id,youtube_subscriber_count,twitch_channel_id,twitch_follower_count,group_id,languages`,
    );
    const vMap = new Map();
    if (vRes.ok && Array.isArray(vRes.data)) {
        for (const v of vRes.data) vMap.set(v.id, v);
    }

    const items = rows.map(r => ({
        id: r.id,
        vtuber_id: r.vtuber_id,
        comment: r.comment,
        created_at: r.created_at,
        vtuber: vMap.get(r.vtuber_id) || null,
    }));

    return jsonResponse({ ok: true, items }, 200, request, { 'Cache-Control': 'no-store' });
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
