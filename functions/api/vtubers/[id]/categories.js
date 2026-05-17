// POST   /api/vtubers/<vtuberId>/categories   { category_id }  → tag
// DELETE /api/vtubers/<vtuberId>/categories?category_id=...    → untag (self only)
//
// 規則:
//   - 必登入,trust_level ≠ banned
//   - category 必須是 approved 才能 tag(server-side 二次驗證,避免 user 偽 ID)
//   - vtuber_id 必須存在
//   - UNIQUE(vtuber_id, category_id) → 已 tag 過回 already_tagged 200
//   - 每日 quota category_tag 50

import { jsonResponse, handleOptions } from '../../../lib/cors.js';
import { getUserIdFromRequest, getTrustLevel, checkAndIncrementQuota } from '../../../lib/auth-helper.js';
import { getVisitorIp, isIpBanned } from '../../../lib/rate-limit.js';
import { select, insert } from '../../../lib/supabase-server.js';
import { logError } from '../../../lib/logger.js';

const MAX_BODY_BYTES = 1 * 1024;
const CATEGORY_TAG_QUOTA = 50;
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

    const ip = getVisitorIp(request);
    if (isIpBanned(env, ip)) {
        return jsonResponse({ ok: false, error: 'banned' }, 403, request);
    }

    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ ok: false, error: 'unauthenticated' }, 401, request);
    }
    const trustLevel = await getTrustLevel(env, userId);
    if (trustLevel === 'banned') {
        return jsonResponse({ ok: false, error: 'banned' }, 403, request);
    }

    // 驗 category status=approved(server-side 防偽)
    const catRes = await select(
        env,
        `vtuber_categories?id=eq.${encodeURIComponent(categoryId)}&select=id,status&limit=1`,
    );
    if (!catRes.ok || !Array.isArray(catRes.data) || catRes.data.length === 0) {
        return jsonResponse({ ok: false, error: 'category_not_found' }, 404, request);
    }
    if (catRes.data[0].status !== 'approved') {
        return jsonResponse({ ok: false, error: 'category_not_approved' }, 403, request);
    }

    // 驗 vtuber 存在
    const vRes = await select(
        env,
        `vtubers?id=eq.${encodeURIComponent(vtuberId)}&select=id&limit=1`,
    );
    if (!vRes.ok || !Array.isArray(vRes.data) || vRes.data.length === 0) {
        return jsonResponse({ ok: false, error: 'vtuber_not_found' }, 404, request);
    }

    // quota
    const quota = await checkAndIncrementQuota(env, userId, 'category_tag', CATEGORY_TAG_QUOTA);
    if (!quota.allowed) {
        return jsonResponse({
            ok: false,
            error: 'quota_exceeded',
            current: quota.newCount,
            limit: quota.quotaLimit,
        }, 429, request);
    }

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
