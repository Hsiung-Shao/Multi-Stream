// Cloudflare Pages Function: Admin 取得指定公告的所有回應
//
// GET /api/admin/announcements/:id/responses
//
// 行為:
//   - 必須 admin trust + aal2(沿用 hardening 慣例)
//   - 回應 { ok: true, total, responses: [{ id, user_id, device_id, choices, text_response, created_at }] }
//   - 上限 1000 筆(避免一次 dump 太多;前端可分頁)
//   - total 用 Prefer: count=exact 取(PostgREST Content-Range header)
//
// service_role 直接讀(RLS 雖也允許 admin SELECT,但 service_role 不依賴 caller JWT 帶到 PostgREST,更穩定)。

import { jsonResponse, handleOptions } from '../../../../lib/cors.js';
import { getUserIdFromRequest, requireAdminTrust } from '../../../../lib/auth-helper.js';
import { logError } from '../../../../lib/logger.js';

const HARD_LIMIT = 1000;

export async function onRequestGet(context) {
    const { request, env, params } = context;

    const { userId, aal } = await getUserIdFromRequest(request, env);
    const gate = await requireAdminTrust(env, userId, aal);
    if (!gate.allowed) {
        const status = (gate.reason === 'unauthenticated' || gate.reason === 'mfa_required') ? 401 : 403;
        return jsonResponse({ ok: false, error: gate.reason }, status, request);
    }

    const id = params?.id;
    if (typeof id !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(id)) {
        return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
    }
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    // 用 Prefer: count=exact 拿到精確 total（在 Content-Range header）
    const url = `${env.SUPABASE_URL}/rest/v1/announcement_responses`
        + `?announcement_id=eq.${encodeURIComponent(id)}`
        + `&select=id,user_id,device_id,choices,text_response,created_at`
        + `&order=created_at.desc`
        + `&limit=${HARD_LIMIT}`;
    let res;
    try {
        res = await fetch(url, {
            method: 'GET',
            headers: {
                apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                Prefer: 'count=exact',
            },
        });
    } catch (e) {
        await logError(env, 'admin-announcement-responses', 'fetch threw', {
            metadata: { error: String(e).slice(0, 300), announcement_id: id },
            userId,
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        await logError(env, 'admin-announcement-responses', 'list failed', {
            metadata: { status: res.status, error: errText.slice(0, 500), announcement_id: id },
            userId,
        });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }

    const responses = await res.json().catch(() => []);
    // Content-Range: "0-19/123" 第三段是 total
    const contentRange = res.headers.get('Content-Range') || '';
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
