// POST   /api/vtubers/<vtuberId>/categories   { category_id }  → tag
// DELETE /api/vtubers/<vtuberId>/categories?category_id=...    → untag (self only)
//
// 2026-05-17 user 偏好「除了登入移除所有限制」:已拿掉 IP banlist / trust_level / quota / category status check
// 保留:必登入(POST/DELETE)、UUID format、vtuber 存在性、DB UNIQUE(vtuber_id, category_id)

import { jsonResponse, handleOptions } from '../../../lib/cors.js';
import { getUserIdFromRequest } from '../../../lib/auth-helper.js';
import { select, insert } from '../../../lib/supabase-server.js';
import { logError } from '../../../lib/logger.js';

const MAX_BODY_BYTES = 1 * 1024;
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

// ========== POST: add tag ==========

export async function onRequestPost(context) {
    const { request, env, params } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const vtuberId = params?.id;
    if (!vtuberId || !UUID_RE.test(vtuberId)) {
        return jsonResponse({ ok: false, error: 'invalid_vtuber_id' }, 400, request);
    }

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

    const categoryId = body?.category_id;
    if (!categoryId || typeof categoryId !== 'string' || !UUID_RE.test(categoryId)) {
        return jsonResponse({ ok: false, error: 'invalid_category_id' }, 400, request);
    }

    // 2026-05-17 只保留必登入 + vtuber 存在性
    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ ok: false, error: 'unauthenticated' }, 401, request);
    }

    // 驗 vtuber 存在(防 FK 失敗 5xx)
    const vRes = await select(
        env,
        `vtubers?id=eq.${encodeURIComponent(vtuberId)}&select=id&limit=1`,
    );
    if (!vRes.ok || !Array.isArray(vRes.data) || vRes.data.length === 0) {
        return jsonResponse({ ok: false, error: 'vtuber_not_found' }, 404, request);
    }

    // (已移除:IP banlist、trust_level、category approved check、daily quota)

    // insert tag
    const row = {
        vtuber_id: vtuberId,
        category_id: categoryId,
        tagged_by: userId,
    };
    const ins = await insert(env, 'vtuber_category_tags', row);
    if (!ins.ok) {
        const errStr = ins.error || '';
        if (ins.status === 409 || /23505|duplicate key/i.test(errStr)) {
            return jsonResponse({ ok: false, reason: 'already_tagged' }, 200, request);
        }
        await logError(env, 'vtuber-categories', 'tag insert failed', {
            userId,
            metadata: { status: ins.status, error: errStr.slice(0, 500), vtuber_id: vtuberId, category_id: categoryId },
        });
        return jsonResponse({ ok: false, error: 'insert_failed' }, 500, request);
    }

    return jsonResponse({ ok: true }, 200, request);
}

// ========== DELETE: untag(self only) ==========

export async function onRequestDelete(context) {
    const { request, env, params } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const vtuberId = params?.id;
    if (!vtuberId || !UUID_RE.test(vtuberId)) {
        return jsonResponse({ ok: false, error: 'invalid_vtuber_id' }, 400, request);
    }

    const url = new URL(request.url);
    const categoryId = url.searchParams.get('category_id');
    if (!categoryId || !UUID_RE.test(categoryId)) {
        return jsonResponse({ ok: false, error: 'invalid_category_id' }, 400, request);
    }

    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ ok: false, error: 'unauthenticated' }, 401, request);
    }

    // self-only delete
    const delUrl = `${env.SUPABASE_URL}/rest/v1/vtuber_category_tags`
        + `?vtuber_id=eq.${encodeURIComponent(vtuberId)}`
        + `&category_id=eq.${encodeURIComponent(categoryId)}`
        + `&tagged_by=eq.${encodeURIComponent(userId)}`;
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
        await logError(env, 'vtuber-categories', 'delete threw', {
            userId,
            metadata: { error: String(e).slice(0, 300), vtuber_id: vtuberId, category_id: categoryId },
        });
        return jsonResponse({ ok: false, error: 'delete_failed' }, 500, request);
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'POST, DELETE, OPTIONS' });
}
