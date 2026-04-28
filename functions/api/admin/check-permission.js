// Cloudflare Pages Function：Admin 權限預檢
//
// 前端 AdminPage mount 時呼叫一次，取回當前 user 的 trust_level
// 非 admin/moderator 應顯示無權頁面（前端 enforce + 後端 RLS 雙保險）

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest, getTrustLevel } from '../../lib/auth-helper.js';

export async function onRequestGet(context) {
    const { request, env } = context;

    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ allowed: false, trust_level: null, reason: 'unauthenticated' }, 401, request);
    }

    const trustLevel = await getTrustLevel(env, userId);
    const allowed = trustLevel === 'admin' || trustLevel === 'moderator';

    return jsonResponse({
        allowed,
        trust_level: trustLevel,
    }, allowed ? 200 : 403, request, { 'Cache-Control': 'no-store' });
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
