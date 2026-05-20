// GET  /api/categories                  → public,列 approved categories
// POST /api/categories  { name }        → authenticated,提分類(自動 approved)
//
// 2026-05-17 user 偏好「除了登入移除所有限制」:已拿掉 IP banlist / trust_level / quota
// 2026-05-20 改:slug server 自動產生(8 字 base62 + cat- 前綴),不接 client slug;移除 description
// 保留:必登入(POST)、input format(防 5xx)、DB UNIQUE(name) / UNIQUE(slug)

import { jsonResponse, handleOptions } from '../lib/cors.js';
import { getUserIdFromRequest } from '../lib/auth-helper.js';
import { select, insert } from '../lib/supabase-server.js';
import { logError, logInfo } from '../lib/logger.js';

const MAX_BODY_BYTES = 2 * 1024;
const NAME_MAX = 30;
const SLUG_RETRY_MAX = 3;
const SLUG_RANDOM_LEN = 8;
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function trimStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max);
}

/**
 * server 自動產 slug,格式 `cat-<8 字 base62>`,例 `cat-A3xK9pQz`
 * 用 crypto.getRandomValues 取密碼學隨機數,避免可預測碰撞
 */
function generateCategorySlug() {
    const bytes = new Uint8Array(SLUG_RANDOM_LEN);
    crypto.getRandomValues(bytes);
    let suffix = '';
    for (let i = 0; i < SLUG_RANDOM_LEN; i++) {
        suffix += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
    }
    return `cat-${suffix}`;
}

// ========== GET: public list approved ==========

export async function onRequestGet(context) {
    const { request, env } = context;
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }
    const res = await select(
        env,
        'vtuber_categories?status=eq.approved&select=id,name,slug&order=name.asc&limit=200',
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

// ========== POST: propose new category(直接 approved) ==========

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

    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ ok: false, error: 'unauthenticated' }, 401, request);
    }

    const name = trimStr(body?.name, NAME_MAX);
    if (!name) return jsonResponse({ ok: false, error: 'name_required' }, 400, request);

    // server-side slug 產生 + UNIQUE(slug) 碰撞 retry。
    // 每次重 try 都產新 slug;UNIQUE(name) 碰撞則直接回 409(retry 也救不了)。
    let lastInsErr = null;
    let lastInsStatus = 500;
    for (let attempt = 0; attempt < SLUG_RETRY_MAX; attempt++) {
        const slug = generateCategorySlug();
        const row = {
            name,
            slug,
            status: 'approved',
            proposed_by: userId,
        };
        const ins = await insert(env, 'vtuber_categories', row);
        if (ins.ok) {
            const created = Array.isArray(ins.data) ? ins.data[0] : ins.data;
            void logInfo(env, 'categories', 'proposed', {
                userId,
                metadata: { id: created?.id, name, slug, attempt },
            });
            return jsonResponse({ ok: true, category: created }, 200, request);
        }

        lastInsErr = ins.error || '';
        lastInsStatus = ins.status;

        const isUniqueViolation = ins.status === 409 || /23505|duplicate key/i.test(lastInsErr);
        if (!isUniqueViolation) break;

        // 區分撞的是 name 還是 slug:PostgREST error details 含 `Key (name)=` 或 `Key (slug)=`,
        // 也可看 constraint 名(vtuber_categories_name_key / vtuber_categories_slug_key)
        const isNameDup = /Key \(name\)|categories_name_key/i.test(lastInsErr);
        if (isNameDup) {
            return jsonResponse({ ok: false, error: 'duplicate_name' }, 409, request);
        }
        // 視為 slug 撞:下一輪 attempt 重產 slug
    }

    // retry 用完仍失敗(極罕見:8 字 base62 = 62^8 ≈ 2.18e14 空間)
    await logError(env, 'categories', 'insert failed after slug retries', {
        userId,
        metadata: { status: lastInsStatus, error: (lastInsErr || '').slice(0, 500), name },
    });
    return jsonResponse({ ok: false, error: 'insert_failed' }, 500, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
