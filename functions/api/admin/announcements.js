// Cloudflare Pages Function: Admin 公告 CRUD
//
// 全部需要 admin trust + aal2(沿用 requireAdminTrust 慣例)。
//
// GET    /api/admin/announcements         → 列出所有 announcements(含 draft/archived)
// POST   /api/admin/announcements         → 新增(body 全欄)
// PUT    /api/admin/announcements?id=xxx  → 更新(body 部分欄位)
// DELETE /api/admin/announcements?id=xxx  → 刪除(CASCADE 會清掉相關 responses)
//
// 所有寫入用 service_role(雖然 RLS 也允許 admin write,service_role 直接寫更穩定且不依賴 caller JWT 帶到 PostgREST)。
//
// 回應:{ ok: true, announcement?: {...} } 或 { ok: false, error: '...' }

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { select, insert, update } from '../../lib/supabase-server.js';
import { logError, logWarn } from '../../lib/logger.js';
import { buildAnnouncementWritePayload } from '../../lib/announcements.js';

const MAX_BODY_BYTES = 32 * 1024;
const LIST_LIMIT = 200;

// 簡易保護:用 ADMIN_API_TOKEN 環境變數驗證(X-Admin-Token header)。
// 不接帳號系統 / 2FA;所有寫入仍以 service_role 進行(繞過 RLS)。
function gateAdmin(request, env) {
    const expected = env?.ADMIN_API_TOKEN;
    if (!expected) {
        // 後端未設定 token → 安全預設為拒絕
        return { ok: false, response: jsonResponse({ ok: false, error: 'admin_not_configured' }, 503, request) };
    }
    const provided = request.headers.get('X-Admin-Token') || '';
    if (provided.length !== expected.length || provided !== expected) {
        return { ok: false, response: jsonResponse({ ok: false, error: 'unauthorized' }, 401, request) };
    }
    return { ok: true, userId: null };
}

function parseIdFromQuery(url) {
    const id = url.searchParams.get('id');
    if (typeof id !== 'string') return null;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
    return id;
}

async function readJsonBody(request) {
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return { ok: false, response: jsonResponse({ ok: false, error: 'invalid_content_type' }, 400, request) };
    }
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) {
        return { ok: false, response: jsonResponse({ ok: false, error: 'body_too_large' }, 413, request) };
    }
    try {
        const body = await request.json();
        return { ok: true, body };
    } catch {
        return { ok: false, response: jsonResponse({ ok: false, error: 'invalid_json' }, 400, request) };
    }
}

// ---------- GET: list ----------

export async function onRequestGet(context) {
    const { request, env } = context;
    const gate = await gateAdmin(request, env);
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
                userId: gate.userId,
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
            userId: gate.userId,
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
    const gate = await gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const built = buildAnnouncementWritePayload(parsed.body, { partial: false });
    if (!built.ok) {
        return jsonResponse({ ok: false, error: built.error }, 400, request);
    }

    const row = { ...built.row, created_by: gate.userId };
    const res = await insert(env, 'announcements', row);
    if (!res.ok) {
        await logError(env, 'admin-announcements', 'insert failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500) },
            userId: gate.userId,
        });
        return jsonResponse({ ok: false, error: 'create_failed' }, 500, request);
    }

    const created = Array.isArray(res.data) ? res.data[0] : res.data;
    // best-effort audit log
    void logWarn(env, 'admin-announcements', 'announcement created', {
        metadata: { id: created?.id, type: created?.type, status: created?.status },
        userId: gate.userId,
    });
    return jsonResponse({ ok: true, announcement: created }, 200, request);
}

// ---------- PUT: update ----------

export async function onRequestPut(context) {
    const { request, env } = context;
    const gate = await gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = parseIdFromQuery(url);
    if (!id) {
        return jsonResponse({ ok: false, error: 'id_required' }, 400, request);
    }

    const parsed = await readJsonBody(request);
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
            userId: gate.userId,
        });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }
    if (!Array.isArray(res.data) || res.data.length === 0) {
        return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    }

    void logWarn(env, 'admin-announcements', 'announcement updated', {
        metadata: { id, fields: Object.keys(built.row) },
        userId: gate.userId,
    });
    return jsonResponse({ ok: true, announcement: res.data[0] }, 200, request);
}

// ---------- DELETE ----------

export async function onRequestDelete(context) {
    const { request, env } = context;
    const gate = await gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = parseIdFromQuery(url);
    if (!id) {
        return jsonResponse({ ok: false, error: 'id_required' }, 400, request);
    }

    // 直接 DELETE via PostgREST(supabase-server.js 沒包 delete,inline 一個 fetch)
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }
    const delUrl = `${env.SUPABASE_URL}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`;
    let res;
    try {
        res = await fetch(delUrl, {
            method: 'DELETE',
            headers: {
                apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                Prefer: 'return=representation',
            },
        });
    } catch (e) {
        await logError(env, 'admin-announcements', 'delete fetch threw', {
            metadata: { error: String(e).slice(0, 300), target_id: id },
            userId: gate.userId,
        });
        return jsonResponse({ ok: false, error: 'delete_failed' }, 500, request);
    }
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        await logError(env, 'admin-announcements', 'delete failed', {
            metadata: { status: res.status, error: errText.slice(0, 500), target_id: id },
            userId: gate.userId,
        });
        return jsonResponse({ ok: false, error: 'delete_failed' }, 500, request);
    }
    const deleted = await res.json().catch(() => []);
    if (!Array.isArray(deleted) || deleted.length === 0) {
        return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    }

    void logWarn(env, 'admin-announcements', 'announcement deleted', {
        metadata: { id },
        userId: gate.userId,
    });
    return jsonResponse({ ok: true }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, POST, PUT, DELETE, OPTIONS' });
}
