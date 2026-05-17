// GET /api/recommendations/<vtuberId>/comments
// 拉某 vtuber 的留言列表(只回 comment IS NOT NULL 的 row,含 user display_name + avatar_url)
//
// 分頁:?cursor=<created_at ISO>&limit=20
// 排序:created_at desc (新留言在前)
// 上限:每頁 50
// Cache-Control: public max-age=15(留言更新頻率不高)

import { jsonResponse, handleOptions } from '../../../lib/cors.js';
import { select } from '../../../lib/supabase-server.js';
import { logError } from '../../../lib/logger.js';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function parseLimit(v) {
    const n = parseInt(v || '', 10);
    if (!Number.isFinite(n) || n <= 0) return PAGE_DEFAULT;
    return Math.min(n, PAGE_MAX);
}

function isIsoTimestamp(s) {
    if (typeof s !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
}

export async function onRequestGet(context) {
    const { request, env, params } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const vtuberId = params?.vtuberId;
    if (!vtuberId || !UUID_RE.test(vtuberId)) {
        return jsonResponse({ ok: false, error: 'invalid_vtuber_id' }, 400, request);
    }

    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get('limit'));
    const cursor = url.searchParams.get('cursor');

    // 拉留言 + user_profiles join(PostgREST 的 embedded resource)
    // 注意:user_profiles.supabase_auth_id = vtuber_recommendations.user_id
    // 但 PostgREST 預設只 FK embed 不支援 alt key,所以我們分兩次查
    const filters = [
        'select=id,vtuber_id,user_id,comment,created_at',
        'comment=not.is.null',
        `vtuber_id=eq.${encodeURIComponent(vtuberId)}`,
        'order=created_at.desc',
        `limit=${limit}`,
    ];
    if (cursor && isIsoTimestamp(cursor)) {
        filters.push(`created_at=lt.${encodeURIComponent(cursor)}`);
    }

    const res = await select(env, `vtuber_recommendations?${filters.join('&')}`);
    if (!res.ok) {
        await logError(env, 'recommendations-comments', 'list failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500), vtuber_id: vtuberId },
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }

    const rows = res.data || [];
    if (rows.length === 0) {
        return jsonResponse(
            { ok: true, items: [], next_cursor: null },
            200,
            request,
            { 'Cache-Control': 'public, max-age=15' },
        );
    }

    // 拉這批 user_id 對應的 display_name / avatar_url
    const userIds = [...new Set(rows.map(r => r.user_id))];
    const inClause = userIds.map(id => encodeURIComponent(id)).join(',');
    const profileRes = await select(
        env,
        `user_profiles?supabase_auth_id=in.(${inClause})&select=supabase_auth_id,display_name,avatar_url`,
    );
    const profileMap = new Map();
    if (profileRes.ok && Array.isArray(profileRes.data)) {
        for (const p of profileRes.data) {
            profileMap.set(p.supabase_auth_id, {
                display_name: p.display_name,
                avatar_url: p.avatar_url,
            });
        }
    }

    const items = rows.map(r => ({
        id: r.id,
        vtuber_id: r.vtuber_id,
        comment: r.comment,
        created_at: r.created_at,
        user: profileMap.get(r.user_id) || { display_name: null, avatar_url: null },
    }));

    const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;

    return jsonResponse(
        { ok: true, items, next_cursor: nextCursor },
        200,
        request,
        { 'Cache-Control': 'public, max-age=15' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
