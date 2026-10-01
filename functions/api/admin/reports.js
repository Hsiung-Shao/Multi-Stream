// Admin：資料回報處理（ADMIN_API_TOKEN，見 lib/auth-helper.js gateAdmin）
//
// GET /api/admin/reports?status=open|resolved|wontfix|duplicate|spam|all&kind=&limit=
//     → 列表（不含 ip_hash），一併帶出被回報的 VTuber（name、slug）與團體名稱
// PUT /api/admin/reports?id=<uuid>  body: { status, admin_notes }
//     → 更新處理狀態；非 open 時記 resolved_at；寫 admin_actions

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { select, update, insert } from '../../lib/supabase-server.js';
import { gateAdmin } from '../../lib/auth-helper.js';
import { logError } from '../../lib/logger.js';
import { REPORT_REASONS_BY_KIND, isUuid } from '../../lib/vtuber-submit.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const STATUSES = ['open', 'resolved', 'wontfix', 'duplicate', 'spam'];
const LIST_COLUMNS =
    'id,kind,reasons,vtuber_id,group_id,stream_platform,stream_external_id,description,source_urls,contact,page_url,status,admin_notes,resolved_at,created_at,' +
    'vtuber:vtubers(name,slug),group:vtuber_groups(name)';

export async function onRequestGet(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'open';
    const kind = url.searchParams.get('kind');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 200);
    const filters = [
        STATUSES.includes(status) ? `status=eq.${status}` : null,
        kind && REPORT_REASONS_BY_KIND[kind] ? `kind=eq.${kind}` : null,
    ].filter(Boolean).map((f) => `&${f}`).join('');
    const res = await select(env, `vtuber_reports?select=${LIST_COLUMNS}${filters}&order=created_at.desc&limit=${limit}`);
    if (!res.ok) {
        await logError(env, 'admin-reports', 'list failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
    return jsonResponse({ ok: true, reports: res.data || [] }, 200, request, NO_STORE);
}

export async function onRequestPut(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const id = new URL(request.url).searchParams.get('id');
    if (!isUuid(id)) return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
    const parsed = await readJsonBody(request, 8 * 1024);
    if (!parsed.ok) return parsed.response;

    const status = parsed.body?.status;
    if (!STATUSES.includes(status)) return jsonResponse({ ok: false, error: 'invalid_status' }, 400, request);
    const notes = typeof parsed.body?.admin_notes === 'string' ? parsed.body.admin_notes.trim().slice(0, 1000) : null;

    const res = await update(env, 'vtuber_reports', `id=eq.${id}`, {
        status,
        admin_notes: notes || null,
        resolved_at: status === 'open' ? null : new Date().toISOString(),
    });
    if (!res.ok) {
        await logError(env, 'admin-reports', 'update failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }
    if (!res.data?.length) return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    await insert(env, 'admin_actions', {
        actor: 'admin_token',
        action_type: 'review_vtuber_report',
        target_id: id,
        after_status: status,
        notes: notes ? notes.slice(0, 500) : null,
    });
    return jsonResponse({ ok: true, report: res.data[0] }, 200, request, NO_STORE);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, PUT, OPTIONS' });
}
