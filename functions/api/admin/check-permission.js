// Cloudflare Pages Function：Admin 權限預檢
//
// 前端 AdminPage mount 時呼叫一次，取回當前 user 的 trust_level + aal
// 非 admin/moderator 應顯示無權頁面（前端 enforce + 後端 RLS 雙保險）
// admin/moderator 但未過 aal2 時 frontend 顯示「需先 2FA 驗證」遮罩

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest, getTrustLevel } from '../../lib/auth-helper.js';

export async function onRequestGet(context) {
    const { request, env } = context;

    const { userId, aal } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ allowed: false, trust_level: null, aal: 'aal1', reason: 'unauthenticated' }, 401, request);
    }

    const trustLevel = await getTrustLevel(env, userId);
    const isAdminOrMod = trustLevel === 'admin' || trustLevel === 'moderator';
    const allowed = isAdminOrMod && aal === 'aal2';
    // aal2_required：權限對但需先過 2FA。前端據此決定是否要彈 enroll/challenge dialog
    const reason = !isAdminOrMod ? 'forbidden' : (aal !== 'aal2' ? 'aal2_required' : null);

    return jsonResponse({
        allowed,
        trust_level: trustLevel,
        aal,
        reason,
    }, allowed ? 200 : 403, request, { 'Cache-Control': 'no-store' });
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
