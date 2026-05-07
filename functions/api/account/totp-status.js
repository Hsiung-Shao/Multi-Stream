// Cloudflare Pages Function：查詢當前 user 的 2FA 狀態
//
// GET /api/account/totp-status
//   回傳：{ enrolled, enrolledAt, backupCodesRemaining, requiredByTrustLevel, currentAal }
//
// 用途：前端 MfaSection mount 時呼叫，決定要顯示「啟用」還是「停用 / 備援碼管理」UI。
// 不回傳 backup code 內容（只回剩餘數量），不回傳 TOTP secret。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest, getTrustLevel } from '../../lib/auth-helper.js';
import { rpc, select } from '../../lib/supabase-server.js';

function decodeAal(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload?.aal || 'aal1';
    } catch {
        return 'aal1';
    }
}

export async function onRequestGet(context) {
    const { request, env } = context;

    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ success: false, error: 'unauthenticated' }, 401, request);
    }

    // 1-3 並行：factors / 備援碼 / trust_level
    // 改用 SECURITY DEFINER RPC 查 auth.mfa_factors（migration 20260507_get_user_totp_factors_rpc）—
    // 之前用 /auth/v1/admin/users/{id}/factors GoTrue endpoint 在不同 Supabase
    // 版本回應結構不一致，導致 enrolled 永遠 false
    const [factorsRpc, secretsRes, trustLevel] = await Promise.all([
        rpc(env, 'get_user_totp_factors', { p_user_id: userId }),
        select(env, `user_mfa_secrets?user_id=eq.${encodeURIComponent(userId)}&select=backup_codes_hashed`),
        getTrustLevel(env, userId),
    ]);

    let enrolled = false;
    let enrolledAt = null;
    if (factorsRpc.ok && Array.isArray(factorsRpc.data)) {
        const verified = factorsRpc.data.find(f => f.status === 'verified');
        if (verified) {
            enrolled = true;
            enrolledAt = verified.created_at || null;
        }
    }

    let backupCodesRemaining = 0;
    if (secretsRes.ok && Array.isArray(secretsRes.data) && secretsRes.data.length > 0) {
        const arr = secretsRes.data[0]?.backup_codes_hashed;
        backupCodesRemaining = Array.isArray(arr) ? arr.length : 0;
    }

    // current AAL
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const currentAal = decodeAal(token);

    // 移除 requiredByTrustLevel 欄位 — opt-in 後沒意義
    return jsonResponse({
        success: true,
        enrolled,
        enrolledAt,
        backupCodesRemaining,
        trustLevel,
        currentAal,
    }, 200, request, { 'Cache-Control': 'no-store' });
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
