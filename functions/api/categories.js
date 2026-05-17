// GET  /api/categories                            → public,列 approved categories
// POST /api/categories  { name, slug, description? } → authenticated,提分類(進 pending)
//
// 防濫用:
//   POST 需登入 + trust_level ≠ banned + IP banlist + daily quota 'category_propose' (3/day)
//
// status='pending' 由 admin 後台審核 → approved → 才能被 tag

import { jsonResponse, handleOptions } from '../lib/cors.js';
import { getUserIdFromRequest, getTrustLevel, checkAndIncrementQuota } from '../lib/auth-helper.js';
import { getVisitorIp, isIpBanned } from '../lib/rate-limit.js';
import { select, insert } from '../lib/supabase-server.js';
import { logError, logInfo } from '../lib/logger.js';

const MAX_BODY_BYTES = 2 * 1024;
const NAME_MAX = 30;
const SLUG_MAX = 50;
const DESC_MAX = 200;
const CATEGORY_PROPOSE_QUOTA = 3;
const SLUG_RE = /^[a-z0-9-]+$/;

function trimStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max);
}

// ========== GET: public list approved ==========

export async function onRequestGet(context) {
    const { request, env } = context;
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }
    const res = await select(
        env,
        'vtuber_categories?status=eq.approved&select=id,name,slug,description&order=name.asc&limit=200',
    );
    if (!res.ok) {
        await logError(env, 'categories', 'list failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500) },
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
    return jsonResponse(
        { ok: true, categories: res.data || [] },
        200,
        request,
        { 'Cache-Control': 'public, max-age=60' },
    );
}

// ========== POST: propose new category(進 pending) ==========

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
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

    // input validation
    const name = trimStr(body?.name, NAME_MAX);
    if (!name) return jsonResponse({ ok: false, error: 'name_required' }, 400, request);

    const slug = trimStr(body?.slug, SLUG_MAX).toLowerCase();
    if (!slug || !SLUG_RE.test(slug)) {
        return jsonResponse({ ok: false, error: 'invalid_slug' }, 400, request);
    }

    let description = null;
    if (body?.description !== undefined && body?.description !== null && body?.description !== '') {
        if (typeof body.description !== 'string') {
            return jsonResponse({ ok: false, error: 'invalid_description' }, 400, request);
        }
        const desc = body.description.trim();
        if (desc.length > DESC_MAX) {
            return jsonResponse({ ok: false, error: 'description_too_long' }, 400, request);
        }
        description = desc || null;
    }

    // daily quota
    const quota = await checkAndIncrementQuota(env, userId, 'category_propose', CATEGORY_PROPOSE_QUOTA);
    if (!quota.allowed) {
        return jsonResponse({
            ok: false,
            error: 'quota_exceeded',
            current: quota.newCount,
            limit: quota.quotaLimit,
        }, 429, request);
    }

    const row = {
        name,
        slug,
        description,
        // 2026-05-17 改:直接 approved(user 偏好移除審核;反正名稱/slug UNIQUE)
        status: 'approved',
        proposed_by: userId,
    };
    const ins = await insert(env, 'vtuber_categories', row);
    if (!ins.ok) {
        const errStr = ins.error || '';
        if (ins.status === 409 || /23505|duplicate key/i.test(errStr)) {
            return jsonResponse({ ok: false, error: 'duplicate_name_or_slug' }, 409, request);
        }
        await logError(env, 'categories', 'insert failed', {
            userId,
            metadata: { status: ins.status, error: errStr.slice(0, 500) },
        });
        return jsonResponse({ ok: false, error: 'insert_failed' }, 500, request);
    }

    const created = Array.isArray(ins.data) ? ins.data[0] : ins.data;
    void logInfo(env, 'categories', 'proposed', {
        userId,
        metadata: { id: created?.id, name, slug },
    });

    return jsonResponse(
        { ok: true, category: created },
        200,
        request,
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
