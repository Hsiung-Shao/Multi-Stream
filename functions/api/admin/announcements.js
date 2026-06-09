// Cloudflare Pages Function: Admin 公告 CRUD
//
// 全部以 ADMIN_API_TOKEN 驗證(X-Admin-Token header,見 lib/auth-helper.js gateAdmin)。
//
// GET    /api/admin/announcements         → 列出所有 announcements(含 draft/archived)
// POST   /api/admin/announcements         → 新增(body 全欄)
// PUT    /api/admin/announcements?id=xxx  → 更新(body 部分欄位)
// DELETE /api/admin/announcements?id=xxx  → 刪除(CASCADE 會清掉相關 responses)
//
// 所有寫入用 service_role(雖然 RLS 也允許 admin write,service_role 直接寫更穩定且不依賴 caller JWT 帶到 PostgREST)。
//
// 回應:{ ok: true, announcement?: {...} } 或 { ok: false, error: '...' }

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { select, insert, update, remove } from '../../lib/supabase-server.js';
import { gateAdmin } from '../../lib/auth-helper.js';
import { logError, logWarn } from '../../lib/logger.js';
import { buildAnnouncementWritePayload, isUuid } from '../../lib/announcements.js';

const MAX_BODY_BYTES = 32 * 1024;
const LIST_LIMIT = 200;

function parseIdFromQuery(url) {
    const id = url.searchParams.get('id');
    return isUuid(id) ? id : null;
}

// ---------- GET: list ----------

export async function onRequestGet(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = parseIdFromQuery(url);
    if (id) {
        // 單筆查詢(後台編輯時用)
        const res = await select(
            env,
            `announcements?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
        );
        if (!res.ok) {
            await logError(env, 'admin-announcements', 'fetch single failed', {
                metadata: { status: res.status, error: res.error?.slice(0, 500) },
            });
            return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
        }
        if (!Array.isArray(res.data) || res.data.length === 0) {
            return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
        }
        return jsonResponse({ ok: true, announcement: res.data[0] }, 200, request, { 'Cache-Control': 'no-store' });
    }

    const res = await select(
        env,
        `announcements?select=*&order=created_at.desc&limit=${LIST_LIMIT}`,
    );
    if (!res.ok) {
        await logError(env, 'admin-announcements', 'list failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500) },
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
    return jsonResponse(
        { ok: true, announcements: res.data || [] },
        200,
        request,
        { 'Cache-Control': 'no-store' },
    );
}

// ---------- POST: create ----------

export async function onRequestPost(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const built = buildAnnouncementWritePayload(parsed.body, { partial: false });
    if (!built.ok) {
        return jsonResponse({ ok: false, error: built.error }, 400, request);
    }

    // token 驗證無使用者身分,created_by 一律 null(欄位 nullable,見 ROADMAP)
    const row = { ...built.row, created_by: null };
    const res = await insert(env, 'announcements', row);
    if (!res.ok) {
        await logError(env, 'admin-announcements', 'insert failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500) },
        });
        return jsonResponse({ ok: false, error: 'create_failed' }, 500, request);
    }

    const created = Array.isArray(res.data) ? res.data[0] : res.data;
    // best-effort audit log
    void logWarn(env, 'admin-announcements', 'announcement created', {
        metadata: { id: created?.id, type: created?.type, status: created?.status },
    });
    return jsonResponse({ ok: true, announcement: created }, 200, request);
}

// ---------- PUT: update ----------

export async function onRequestPut(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = parseIdFromQuery(url);
    if (!id) {
        return jsonResponse({ ok: false, error: 'id_required' }, 400, request);
    }

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const built = buildAnnouncementWritePayload(parsed.body, { partial: true });
    if (!built.ok) {
        return jsonResponse({ ok: false, error: built.error }, 400, request);
    }
    if (Object.keys(built.row).length === 0) {
        return jsonResponse({ ok: false, error: 'no_fields_to_update' }, 400, request);
    }

    const res = await update(
        env,
        'announcements',
        `id=eq.${encodeURIComponent(id)}`,
        built.row,
    );
    if (!res.ok) {
        await logError(env, 'admin-announcements', 'update failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500), target_id: id },
        });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }
    if (!Array.isArray(res.data) || res.data.length === 0) {
        return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    }

    void logWarn(env, 'admin-announcements', 'announcement updated', {
        metadata: { id, fields: Object.keys(built.row) },
    });
    return jsonResponse({ ok: true, announcement: res.data[0] }, 200, request);
}

// ---------- DELETE ----------

export async function onRequestDelete(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = parseIdFromQuery(url);
    if (!id) {
        return jsonResponse({ ok: false, error: 'id_required' }, 400, request);
    }
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const res = await remove(env, 'announcements', `id=eq.${encodeURIComponent(id)}`);
    if (!res.ok) {
        await logError(env, 'admin-announcements', 'delete failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500), target_id: id },
        });
        return jsonResponse({ ok: false, error: 'delete_failed' }, 500, request);
    }
    if (!Array.isArray(res.data) || res.data.length === 0) {
        return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    }

    void logWarn(env, 'admin-announcements', 'announcement deleted', {
        metadata: { id },
    });
    return jsonResponse({ ok: true }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, POST, PUT, DELETE, OPTIONS' });
}
