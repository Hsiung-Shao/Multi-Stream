// POST /api/admin/categories/review
//   body: { id: uuid, action: 'approve' | 'reject', notes?: string }
//
// 由 admin/moderator(aal2)審核 pending vtuber_categories,設 status='approved'/'rejected'。
// approved 後該 category 才會出現在 public list,user 才能對 vtuber 打此 tag。

import { jsonResponse, handleOptions } from '../../../lib/cors.js';
import { getUserIdFromRequest, requireAdminTrust } from '../../../lib/auth-helper.js';
import { select, update } from '../../../lib/supabase-server.js';
import { logError, logWarn } from '../../../lib/logger.js';

const MAX_BODY_BYTES = 2 * 1024;
const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const NOTES_MAX = 1000;

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

    // admin gate(aal2 + admin/moderator)
    const { userId, aal } = await getUserIdFromRequest(request, env);
    const gate = await requireAdminTrust(env, userId, aal);
    if (!gate.allowed) {
        const status = (gate.reason === 'unauthenticated' || gate.reason === 'mfa_required') ? 401 : 403;
        return jsonResponse({ ok: false, error: gate.reason }, status, request);
    }

    const { id, action, notes } = body || {};
    if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
        return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
    }
    if (action !== 'approve' && action !== 'reject') {
        return jsonResponse({ ok: false, error: 'invalid_action' }, 400, request);
    }
    let notesStr = null;
    if (notes !== undefined && notes !== null && notes !== '') {
        if (typeof notes !== 'string') {
            return jsonResponse({ ok: false, error: 'invalid_notes' }, 400, request);
        }
        const trimmed = notes.trim();
        if (trimmed.length > NOTES_MAX) {
            return jsonResponse({ ok: false, error: 'notes_too_long' }, 400, request);
        }
        notesStr = trimmed || null;
    }

    // 取既有 category 看 status(避免重複審核 already-decided ones,雖然不致命)
    const existRes = await select(
        env,
        `vtuber_categories?id=eq.${encodeURIComponent(id)}&select=id,status&limit=1`,
    );
    if (!existRes.ok || !Array.isArray(existRes.data) || existRes.data.length === 0) {
        return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    }
    if (existRes.data[0].status !== 'pending') {
        return jsonResponse({
            ok: false,
            error: 'not_pending',
            current_status: existRes.data[0].status,
        }, 409, request);
    }

    // 寫入新狀態
    const patch = {
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewer_notes: notesStr,
        reviewed_at: new Date().toISOString(),
    };
    const upd = await update(
        env,
        'vtuber_categories',
        `id=eq.${encodeURIComponent(id)}`,
        patch,
    );
    if (!upd.ok) {
        await logError(env, 'admin-categories-review', 'update failed', {
            userId,
            metadata: { status: upd.status, error: upd.error?.slice(0, 500), target_id: id, action },
        });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }
    if (!Array.isArray(upd.data) || upd.data.length === 0) {
        return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    }

    void logWarn(env, 'admin-categories-review', 'category reviewed', {
        userId,
        metadata: { id, action, has_notes: !!notesStr },
    });

    return jsonResponse({ ok: true, category: upd.data[0] }, 200, request);
}

// GET /api/admin/categories/review  → 列 pending(供 admin 後台清單)
export async function onRequestGet(context) {
    const { request, env } = context;

    const { userId, aal } = await getUserIdFromRequest(request, env);
    const gate = await requireAdminTrust(env, userId, aal);
    if (!gate.allowed) {
        const status = (gate.reason === 'unauthenticated' || gate.reason === 'mfa_required') ? 401 : 403;
        return jsonResponse({ ok: false, error: gate.reason }, status, request);
    }

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || 'pending';
    const validStatus = ['pending', 'approved', 'rejected', 'archived', 'all'];
    if (!validStatus.includes(statusFilter)) {
        return jsonResponse({ ok: false, error: 'invalid_status' }, 400, request);
    }

    const filters = ['select=*', 'order=created_at.desc', 'limit=200'];
    if (statusFilter !== 'all') {
        filters.push(`status=eq.${statusFilter}`);
    }

    const res = await select(env, `vtuber_categories?${filters.join('&')}`);
    if (!res.ok) {
        await logError(env, 'admin-categories-review', 'list failed', {
            userId,
            metadata: { status: res.status, error: res.error?.slice(0, 500) },
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }

    return jsonResponse(
        { ok: true, categories: res.data || [] },
        200,
        request,
        { 'Cache-Control': 'no-store' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, POST, OPTIONS' });
}
