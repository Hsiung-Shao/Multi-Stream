// Cloudflare Pages Function：永久刪除使用者帳號
//
// POST /api/account/delete-account { confirmDisplayName: string }
//
// 流程：
// 1. 驗 JWT，取出 user_id
// 2. 取 user_profiles.display_name，與前端傳來的 confirmDisplayName 比對（防誤刪）
// 3. 呼叫 RPC delete_user_cascade(user_id) 級聯刪 public schema 資料
// 4. 呼叫 Supabase Admin API DELETE /auth/v1/admin/users/{user_id} 刪 auth.users
// 5. 寫 admin_actions（action_type='self_delete_account'）作為 audit
// 6. 回 200，前端負責 sign out + redirect

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { rpc, select, insert } from '../../lib/supabase-server.js';
import { logError, logInfo } from '../../lib/logger.js';

const MAX_BODY_BYTES = 4 * 1024;

export async function onRequestPost(context) {
    const { request, env } = context;

    // 1. 認證
    const { userId, aal } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ success: false, error: 'unauthenticated' }, 401, request);
    }

    // 1b. 啟用 2FA 的 user 必須通過 TOTP 升 aal2 才能刪帳號
    // 防止攻擊者偷到 aal1 token 後永久刪除帳號（不可逆操作）
    const factorsCheck = await rpc(env, 'get_user_totp_factors', { p_user_id: userId });
    const has2FA = factorsCheck.ok
        && Array.isArray(factorsCheck.data)
        && factorsCheck.data.some(f => f.status === 'verified');
    if (has2FA && aal !== 'aal2') {
        return jsonResponse({ success: false, error: 'aal2_required' }, 403, request);
    }

    // 2. Body 解析
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return jsonResponse({ success: false, error: 'Invalid Content-Type' }, 400, request);
    }
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ success: false, error: 'Body too large' }, 413, request);
    }
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ success: false, error: '無效的 JSON' }, 400, request);
    }
    const confirmDisplayName = String(body?.confirmDisplayName || '').trim();
    if (!confirmDisplayName) {
        return jsonResponse({ success: false, error: '需要提供 display_name 確認' }, 400, request);
    }

    // 3. 比對 display_name（防誤刪 — 必須完全相符）
    const profileRes = await select(
        env,
        `user_profiles?supabase_auth_id=eq.${encodeURIComponent(userId)}&select=display_name&limit=1`,
    );
    if (!profileRes.ok || !Array.isArray(profileRes.data) || profileRes.data.length === 0) {
        return jsonResponse({ success: false, error: '找不到使用者資料' }, 404, request);
    }
    const actualName = String(profileRes.data[0].display_name || '').trim();
    if (actualName !== confirmDisplayName) {
        return jsonResponse({ success: false, error: '確認名稱不符' }, 400, request);
    }

    // 4. 級聯刪除 public schema 資料
    const cascadeRes = await rpc(env, 'delete_user_cascade', { p_auth_user_id: userId });
    if (!cascadeRes.ok) {
        await logError(env, 'delete-account', 'delete_user_cascade RPC failed', {
            userId,
            metadata: { error: cascadeRes.error?.slice(0, 500) },
        });
        return jsonResponse({ success: false, error: '刪除資料失敗' }, 500, request);
    }
    const deletedSummary = cascadeRes.data || {};

    // 5. 刪 auth.users（Supabase Admin API）
    const adminRes = await fetch(
        `${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        {
            method: 'DELETE',
            headers: {
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
        },
    );
    if (!adminRes.ok) {
        const errText = await adminRes.text().catch(() => '');
        await logError(env, 'delete-account', 'auth.admin.deleteUser failed', {
            userId,
            metadata: { status: adminRes.status, error: errText.slice(0, 500), public_schema_already_deleted: deletedSummary },
        });
        // public schema 已刪但 auth.users 沒刪 — 這是 inconsistent 狀態，需 admin 介入
        return jsonResponse({
            success: false,
            error: '帳號資料已清除，但認證紀錄刪除失敗，請聯繫管理員',
        }, 500, request);
    }

    // 6. Audit log（記在 admin_actions，雖然不是 admin 操作但這是高敏感事件）
    await insert(env, 'admin_actions', {
        admin_user_id: userId, // 自己刪自己
        action_type: 'self_delete_account',
        target_id: null, // user 已不存在
        decision: null,
        before_status: 'active',
        after_status: 'deleted',
        notes: null,
        metadata: { deleted_summary: deletedSummary, deleted_at: new Date().toISOString() },
    });

    await logInfo(env, 'delete-account', 'user self-deleted account', {
        userId,
        metadata: { deleted_summary: deletedSummary },
    });

    return jsonResponse({ success: true, deleted: deletedSummary }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
