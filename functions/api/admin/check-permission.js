// Cloudflare Pages Function：Admin 權限預檢
//
// 前端 AdminPage mount 時呼叫一次，取回當前 user 的 trust_level + 是否可進後台
// 設計：強制要求 aal2（與 review-* endpoints 一致），前端 enforce + 後端 RLS 三重保險
//
// HTTP 狀態語意：
//   200 → 允許進後台（trust_level=admin/moderator 且 aal=aal2）
//   401 → 驗證不足（未登入 或 session 尚未升 aal2）— 前端應觸發 MfaLoginGate / 登入流程
//   403 → 永久無權（trust_level 非 admin/moderator，或 banned）— 前端顯示「無權限」UI

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest, requireAdminTrust } from '../../lib/auth-helper.js';

export async function onRequestGet(context) {
    const { request, env } = context;

    const { userId, aal } = await getUserIdFromRequest(request, env);
    const gate = await requireAdminTrust(env, userId, aal);

    // 401: unauthenticated / mfa_required（驗證不足）
    // 403: banned / forbidden（永久無權）
    let status;
    if (gate.allowed) {
        status = 200;
    } else if (gate.reason === 'unauthenticated' || gate.reason === 'mfa_required') {
        status = 401;
    } else {
        status = 403;
    }

    return jsonResponse({
        allowed: gate.allowed,
        trust_level: gate.trustLevel,
        reason: gate.reason,
    }, status, request, { 'Cache-Control': 'no-store' });
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
