// Cloudflare Pages Function: Admin 取得指定公告的所有回應
//
// GET /api/admin/announcements/:id/responses
//
// 行為:
//   - ADMIN_API_TOKEN 驗證(X-Admin-Token header,見 lib/auth-helper.js gateAdmin)
//   - 回應 { ok: true, total, responses: [{ id, user_id, device_id, choices, text_response, created_at }] }
//   - 上限 1000 筆(避免一次 dump 太多;前端可分頁)
//   - total 用 Prefer: count=exact 取(PostgREST Content-Range header)
//
// service_role 直接讀(RLS 雖也允許 admin SELECT,但 service_role 不依賴 caller JWT 帶到 PostgREST,更穩定)。

import { jsonResponse, handleOptions } from '../../../../lib/cors.js';
import { select } from '../../../../lib/supabase-server.js';
import { gateAdmin } from '../../../../lib/auth-helper.js';
import { logError } from '../../../../lib/logger.js';
import { isUuid } from '../../../../lib/announcements.js';

const HARD_LIMIT = 1000;

export async function onRequestGet(context) {
    const { request, env, params } = context;

    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const id = params?.id;
    if (!isUuid(id)) {
        return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
    }
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    // 用 Prefer: count=exact 拿到精確 total(在 Content-Range header)
    const query = `announcement_responses`
        + `?announcement_id=eq.${encodeURIComponent(id)}`
        + `&select=id,user_id,device_id,choices,text_response,created_at`
        + `&order=created_at.desc`
        + `&limit=${HARD_LIMIT}`;
    const res = await select(env, query, { prefer: 'count=exact' });

    if (!res.ok) {
        await logError(env, 'admin-announcement-responses', 'list failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500), announcement_id: id },
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }

    const responses = res.data;
    // Content-Range: "0-19/123" 第三段是 total
    const contentRange = res.headers?.get('Content-Range') || '';
    const totalMatch = contentRange.match(/\/(\d+)$/);
    const total = totalMatch ? parseInt(totalMatch[1], 10) : (Array.isArray(responses) ? responses.length : 0);

    return jsonResponse(
        {
            ok: true,
            total: Number.isFinite(total) ? total : 0,
            limit: HARD_LIMIT,
            truncated: Array.isArray(responses) && responses.length >= HARD_LIMIT && total > HARD_LIMIT,
            responses: Array.isArray(responses) ? responses : [],
        },
        200,
        request,
        { 'Cache-Control': 'no-store' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
