// Cloudflare Pages Function: Admin 已知問題（known_issues）CRUD
//
// 以 ADMIN_API_TOKEN 驗證（X-Admin-Token header，見 lib/auth-helper.js gateAdmin），寫入走 service_role。
//
// GET    /api/admin/known-issues         → 列出全部（含未公開、已解決）
// POST   /api/admin/known-issues         → 新增
// PUT    /api/admin/known-issues?id=xxx  → 更新（部分欄位）
// DELETE /api/admin/known-issues?id=xxx  → 刪除
//
// 公開頁讀取走 /api/status（edge 快取 60 秒＋頁面每分鐘重抓，後台改完約 1～2 分鐘才看得到）。
// 回應：{ ok: true, issue(s)? } 或 { ok: false, error }

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { select, insert, update, remove } from '../../lib/supabase-server.js';
import { gateAdmin } from '../../lib/auth-helper.js';
import { logError, logWarn } from '../../lib/logger.js';
import { isUuid } from '../../lib/announcements.js';
import { buildKnownIssueWritePayload } from '../../lib/known-issues.js';

const MAX_BODY_BYTES = 16 * 1024;
const LIST_LIMIT = 200;
const NO_STORE = { 'Cache-Control': 'no-store' };
const SOURCE = 'admin-known-issues';

function idFromQuery(request) {
    const id = new URL(request.url).searchParams.get('id');
    return isUuid(id) ? id : null;
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const res = await select(env, `known_issues?select=*&order=updated_at.desc&limit=${LIST_LIMIT}`);
    if (!res.ok) {
        await logError(env, SOURCE, 'list failed', { metadata: { status: res.status, error: res.error?.slice(0, 500) } });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
    return jsonResponse({ ok: true, issues: res.data || [] }, 200, request, NO_STORE);
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    const built = buildKnownIssueWritePayload(parsed.body, { partial: false });
    if (!built.ok) return jsonResponse({ ok: false, error: built.error }, 400, request);

    const res = await insert(env, 'known_issues', built.row);
    if (!res.ok) {
        await logError(env, SOURCE, 'insert failed', { metadata: { status: res.status, error: res.error?.slice(0, 500) } });
        return jsonResponse({ ok: false, error: 'create_failed' }, 500, request);
    }
    const created = Array.isArray(res.data) ? res.data[0] : res.data;
    void logWarn(env, SOURCE, 'known issue created', { metadata: { id: created?.id, status: created?.status, is_public: created?.is_public } });
    return jsonResponse({ ok: true, issue: created }, 200, request);
}

export async function onRequestPut(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const id = idFromQuery(request);
    if (!id) return jsonResponse({ ok: false, error: 'id_required' }, 400, request);

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    // 先查目前狀態：狀態沒變時不能刷新 resolved_at
    const current = await select(env, `known_issues?id=eq.${encodeURIComponent(id)}&select=status&limit=1`);
    if (!current.ok) {
        await logError(env, SOURCE, 'fetch before update failed', { metadata: { status: current.status, target_id: id } });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }
    if (!Array.isArray(current.data) || current.data.length === 0) return jsonResponse({ ok: false, error: 'not_found' }, 404, request);

    const built = buildKnownIssueWritePayload(parsed.body, { partial: true, previousStatus: current.data[0].status });
    if (!built.ok) return jsonResponse({ ok: false, error: built.error }, 400, request);
    if (Object.keys(built.row).length === 0) return jsonResponse({ ok: false, error: 'no_fields_to_update' }, 400, request);

    const res = await update(env, 'known_issues', `id=eq.${encodeURIComponent(id)}`, built.row);
    if (!res.ok) {
        await logError(env, SOURCE, 'update failed', { metadata: { status: res.status, error: res.error?.slice(0, 500), target_id: id } });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }
    if (!Array.isArray(res.data) || res.data.length === 0) return jsonResponse({ ok: false, error: 'not_found' }, 404, request);

    void logWarn(env, SOURCE, 'known issue updated', { metadata: { id, fields: Object.keys(built.row) } });
    return jsonResponse({ ok: true, issue: res.data[0] }, 200, request);
}

export async function onRequestDelete(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const id = idFromQuery(request);
    if (!id) return jsonResponse({ ok: false, error: 'id_required' }, 400, request);

    const res = await remove(env, 'known_issues', `id=eq.${encodeURIComponent(id)}`);
    if (!res.ok) {
        await logError(env, SOURCE, 'delete failed', { metadata: { status: res.status, error: res.error?.slice(0, 500), target_id: id } });
        return jsonResponse({ ok: false, error: 'delete_failed' }, 500, request);
    }
    if (!Array.isArray(res.data) || res.data.length === 0) return jsonResponse({ ok: false, error: 'not_found' }, 404, request);

    void logWarn(env, SOURCE, 'known issue deleted', { metadata: { id } });
    return jsonResponse({ ok: true }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, POST, PUT, DELETE, OPTIONS' });
}
