// Cloudflare Pages Function: 推薦 CRUD endpoint
//
// POST   /api/recommendations
//   body: { name, platform: 'twitch'|'youtube', channel_id, url, comment? }
//   200 { ok: true, recommendation_id, vtuber_id }
//   200 { ok: false, reason: 'already_recommended' }   ← DB UNIQUE 衝突視同已推
//
// GET    /api/recommendations?sort=daily|all-time|latest&category=<slug>&cursor=<id>&limit=24
//   anon OK,public 都能看(顯示推薦數、留言)
//
// DELETE /api/recommendations?id=<recommendation_id>   → 撤回自己推薦(owner only)
//
// 2026-05-17 重構:user 偏好「除了登入以外移除所有限制」(功能完全正常後再加回必要防護)。
// 移除:IP banlist / trust_level / Turnstile / KV per-IP / DB daily quota / user_favorites
// 保留:必登入(POST/DELETE)、input format(防 5xx)、DB UNIQUE/CHECK(資料完整性)

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { select, insert } from '../../lib/supabase-server.js';
import { logError, logInfo } from '../../lib/logger.js';
import {
    validateRecommendInput,
    trimStr,
    COMMENT_MAX_LEN,
    ensureVtuberRow,
} from '../../lib/recommendations.js';

const MAX_BODY_BYTES = 4 * 1024;
const LIST_LIMIT_DEFAULT = 24;
const LIST_LIMIT_MAX = 60;

// ========== POST: create recommendation ==========

export async function onRequestPost(context) {
    const { request, env } = context;

    // ---- 0. server misconfigured guard ----
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    // ---- 1. content-type / size ----
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return jsonResponse({ ok: false, error: 'invalid_content_type' }, 400, request);
    }
    if (parseInt(request.headers.get('Content-Length') || '0', 10) > MAX_BODY_BYTES) {
        return jsonResponse({ ok: false, error: 'body_too_large' }, 413, request);
    }

    let body;
    try { body = await request.json(); } catch {
        return jsonResponse({ ok: false, error: 'invalid_json' }, 400, request);
    }

    // ---- 2. must be authenticated(唯一保留的攔截) ----
    // user 偏好「移除除了登入以外的所有限制」,功能完全正常後才會加回必要防護。
    // 已移除:IP banlist / trust_level / Turnstile / KV / DB quota / user_favorites
    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ ok: false, error: 'unauthenticated' }, 401, request);
    }

    // ---- 3. input format(保留:防 5xx / db error,但極寬鬆) ----
    const validationErr = validateRecommendInput(body);
    if (validationErr) {
        return jsonResponse({ ok: false, error: validationErr }, 400, request);
    }

    // ---- 4. ensure vtubers row exists ----
    const ensured = await ensureVtuberRow(env, {
        name: trimStr(body.name, 100),
        platform: body.platform,
        channelId: body.channel_id,
        userId,
    });
    if (!ensured.ok) {
        return jsonResponse({ ok: false, error: ensured.error || 'create_vtuber_failed' }, 500, request);
    }

    // ---- 11. insert recommendation ----
    const comment = body.comment ? trimStr(body.comment, COMMENT_MAX_LEN) : null;
    const row = {
        vtuber_id: ensured.vtuberId,
        user_id: userId,
        comment: comment || null,
    };
    const ins = await insert(env, 'vtuber_recommendations', row);
    if (!ins.ok) {
        const errStr = ins.error || '';
        if (ins.status === 409 || /23505|duplicate key/i.test(errStr)) {
            // 已推過視同成功 dedupe(client 不該報錯)
            return jsonResponse({
                ok: false,
                reason: 'already_recommended',
                vtuber_id: ensured.vtuberId,
            }, 200, request);
        }
        await logError(env, 'recommendations', 'insert failed', {
            userId,
            metadata: { status: ins.status, error: errStr.slice(0, 500), vtuber_id: ensured.vtuberId },
        });
        return jsonResponse({ ok: false, error: 'insert_failed' }, 500, request);
    }

    const created = Array.isArray(ins.data) ? ins.data[0] : ins.data;
    void logInfo(env, 'recommendations', 'recommended', {
        userId,
        metadata: { vtuber_id: ensured.vtuberId, has_comment: !!comment, already_in_vtubers: ensured.alreadyExists },
    });

    return jsonResponse({
        ok: true,
        recommendation_id: created?.id,
        vtuber_id: ensured.vtuberId,
    }, 200, request);
}

// ========== GET: list recommendations ==========

function parseSort(v) {
    if (v === 'daily' || v === 'all-time' || v === 'latest') return v;
    return 'daily';
}

function parseLimit(v) {
    const n = parseInt(v || '', 10);
    if (!Number.isFinite(n) || n <= 0) return LIST_LIMIT_DEFAULT;
    return Math.min(n, LIST_LIMIT_MAX);
}

function isUuid(s) {
    return typeof s === 'string' && /^[0-9a-fA-F-]{36}$/.test(s);
}

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const url = new URL(request.url);
    const sort = parseSort(url.searchParams.get('sort'));
    const limit = parseLimit(url.searchParams.get('limit'));
    const categorySlug = url.searchParams.get('category');
    const cursorVtuberId = url.searchParams.get('cursor');

    // 排行榜(daily / all-time):用 PostgREST 聚合不方便,改 RPC 或直接 raw SQL via service_role
    // 簡化:目前 vtuber_recommendations row 少,先用 select all + 前端 / endpoint 聚合
    // 後續 V2 改 materialized view

    if (sort === 'latest') {
        // 最新留言模式(單筆 row,非彙總)
        const filters = ['select=id,vtuber_id,user_id,comment,created_at', 'order=created_at.desc', `limit=${limit}`];
        if (cursorVtuberId && isUuid(cursorVtuberId)) {
            filters.push(`created_at=lt.${encodeURIComponent(cursorVtuberId)}`);  // cursor 是 ISO timestamp
        }
        const res = await select(env, `vtuber_recommendations?${filters.join('&')}`);
        if (!res.ok) {
            await logError(env, 'recommendations', 'list latest failed', {
                metadata: { status: res.status, error: res.error?.slice(0, 500) },
            });
            return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
        }
        return jsonResponse(
            { ok: true, sort, items: res.data || [] },
            200,
            request,
            { 'Cache-Control': 'public, max-age=15' },
        );
    }

    // daily / all-time: 用 RPC 走聚合(下方 helper SQL,實作完用 supabase functions create)
    // 為了 V1 minimal:用 PostgREST horizontal filtering + 前端 group
    // 排行榜:抓最近 24h 全部 row + return raw,讓前端 group
    const since = sort === 'daily'
        ? new Date(Date.now() - 24 * 3600 * 1000).toISOString()
        : null;

    const filters = ['select=id,vtuber_id,user_id,comment,created_at'];
    if (since) {
        filters.push(`created_at=gte.${encodeURIComponent(since)}`);
    }
    filters.push('order=created_at.desc');
    // 不分頁:rows 不會太多,V1 接受全量
    filters.push('limit=2000');

    const res = await select(env, `vtuber_recommendations?${filters.join('&')}`);
    if (!res.ok) {
        await logError(env, 'recommendations', 'list aggregated failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500) },
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }

    // 聚合:vtuber_id → { count, latest_at, comments: [...max 3] }
    const map = new Map();
    for (const r of res.data || []) {
        if (!map.has(r.vtuber_id)) {
            map.set(r.vtuber_id, {
                vtuber_id: r.vtuber_id,
                count: 0,
                latest_at: r.created_at,
                comments_preview: [],
            });
        }
        const entry = map.get(r.vtuber_id);
        entry.count++;
        if (r.comment && entry.comments_preview.length < 3) {
            entry.comments_preview.push({ comment: r.comment, created_at: r.created_at });
        }
    }

    // 排序 by count desc, latest_at desc
    let items = Array.from(map.values()).sort(
        (a, b) => b.count - a.count || (b.latest_at > a.latest_at ? 1 : -1),
    );

    // 若有 category filter:抓 category_id 對應的 vtuber_id 集合再 filter
    if (categorySlug && typeof categorySlug === 'string' && /^[a-z0-9-]+$/.test(categorySlug)) {
        const catRes = await select(
            env,
            `vtuber_categories?slug=eq.${encodeURIComponent(categorySlug)}&status=eq.approved&select=id&limit=1`,
        );
        if (catRes.ok && Array.isArray(catRes.data) && catRes.data.length > 0) {
            const catId = catRes.data[0].id;
            const tagRes = await select(
                env,
                `vtuber_category_tags?category_id=eq.${encodeURIComponent(catId)}&select=vtuber_id&limit=1000`,
            );
            if (tagRes.ok && Array.isArray(tagRes.data)) {
                const vtuberIdsInCat = new Set(tagRes.data.map(t => t.vtuber_id));
                items = items.filter(it => vtuberIdsInCat.has(it.vtuber_id));
            }
        }
    }

    items = items.slice(0, limit);

    // 拉這批 vtuber metadata(name / img / channel ids / counts)讓前端不需二次 fetch
    if (items.length > 0) {
        const vtuberIds = items.map(it => it.vtuber_id);
        const inClause = vtuberIds.map(id => encodeURIComponent(id)).join(',');
        const vRes = await select(
            env,
            `vtubers?id=in.(${inClause})&select=id,name,img_url,nationality,activity,youtube_channel_id,youtube_subscriber_count,twitch_channel_id,twitch_follower_count,group_id`,
        );
        const vMap = new Map();
        if (vRes.ok && Array.isArray(vRes.data)) {
            for (const v of vRes.data) vMap.set(v.id, v);
        }
        items = items.map(it => ({ ...it, vtuber: vMap.get(it.vtuber_id) || null }));
    }

    return jsonResponse(
        { ok: true, sort, items },
        200,
        request,
        { 'Cache-Control': 'public, max-age=30' },
    );
}

// ========== DELETE: revoke own recommendation ==========

export async function onRequestDelete(context) {
    const { request, env } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ ok: false, error: 'unauthenticated' }, 401, request);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!isUuid(id)) {
        return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
    }

    // 用 service_role DELETE,filter 含 user_id 確保 owner only
    const delUrl = `${env.SUPABASE_URL}/rest/v1/vtuber_recommendations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`;
    try {
        const res = await fetch(delUrl, {
            method: 'DELETE',
            headers: {
                apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                Prefer: 'return=representation',
            },
        });
        if (!res.ok) {
            return jsonResponse({ ok: false, error: 'delete_failed' }, 500, request);
        }
        const deleted = await res.json().catch(() => []);
        if (!Array.isArray(deleted) || deleted.length === 0) {
            return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
        }
        return jsonResponse({ ok: true }, 200, request);
    } catch (e) {
        await logError(env, 'recommendations', 'delete threw', {
            userId,
            metadata: { error: String(e).slice(0, 300), id },
        });
        return jsonResponse({ ok: false, error: 'delete_failed' }, 500, request);
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, POST, DELETE, OPTIONS' });
}
