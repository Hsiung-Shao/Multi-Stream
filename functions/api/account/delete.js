// POST /api/account/delete：刪除自己的帳號（需 Supabase 登入的 Bearer token）。
//
// 收藏、分類、標籤、個人檔案等表對 auth.users 設了 ON DELETE CASCADE，刪使用者就一起刪；
// announcement_responses 沒有 CASCADE，要先刪，否則刪使用者會被外鍵擋下。
// 只刪「token 驗證出來的那個使用者」，不接受 body 指定 id。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { remove } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function onRequestPost(context) {
    const { request, env } = context;
    const reply = (data, status) => jsonResponse(data, status, request, NO_STORE);

    const { userId, verified } = await getUserIdFromRequest(request, env);
    if (!verified || !userId) return reply({ ok: false, error: 'unauthorized' }, 401);

    const responses = await remove(env, 'announcement_responses', `user_id=eq.${encodeURIComponent(userId)}`);
    if (!responses.ok) {
        await logError(env, 'account-delete', `announcement_responses ${responses.status}`);
        return reply({ ok: false, error: 'delete_failed' }, 502);
    }

    try {
        const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
            headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
        });
        if (!res.ok) {
            await logError(env, 'account-delete', `admin_delete ${res.status}`);
            return reply({ ok: false, error: 'delete_failed' }, 502);
        }
    } catch {
        return reply({ ok: false, error: 'delete_failed' }, 502);
    }
    return reply({ ok: true }, 200);
}

export const onRequestOptions = ({ request }) => handleOptions(request, { methods: 'POST, OPTIONS' });
