// Cloudflare Pages Function：查詢當前 user 的 2FA 狀態
//
// GET /api/account/totp-status
//   回傳：{ enrolled, enrolledAt, backupCodesRemaining, requiredByTrustLevel, currentAal }
//
// 用途：前端 MfaSection mount 時呼叫，決定要顯示「啟用」還是「停用 / 備援碼管理」UI。
// 不回傳 backup code 內容（只回剩餘數量），不回傳 TOTP secret。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest, getTrustLevel } from '../../lib/auth-helper.js';
import { select } from '../../lib/supabase-server.js';

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

    // 1-3 並行（互不依賴）：factors / 備援碼 / trust_level
    const [factorsResult, secretsRes, trustLevel] = await Promise.all([
        fetch(
            `${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}/factors`,
            {
                headers: {
                    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                },
            },
        ).then(async r => r.ok ? await r.json().catch(() => null) : null).catch(() => null),
        select(env, `user_mfa_secrets?user_id=eq.${encodeURIComponent(userId)}&select=backup_codes_hashed`),
        getTrustLevel(env, userId),
    ]);

    let enrolled = false;
    let enrolledAt = null;
    if (factorsResult) {
        const factors = Array.isArray(factorsResult?.factors)
            ? factorsResult.factors
            : (Array.isArray(factorsResult) ? factorsResult : []);
        const verified = factors.find(f => f.factor_type === 'totp' && f.status === 'verified');
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

    const requiredByTrustLevel = trustLevel === 'admin' || trustLevel === 'moderator';

    // 4. current AAL
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const currentAal = decodeAal(token);

    return jsonResponse({
        success: true,
        enrolled,
        enrolledAt,
        backupCodesRemaining,
        requiredByTrustLevel,
        trustLevel,
        currentAal,
    }, 200, request, { 'Cache-Control': 'no-store' });
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
