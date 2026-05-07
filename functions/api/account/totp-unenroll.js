// Cloudflare Pages Function：停用 2FA（移除使用者所有 TOTP factor）
//
// POST /api/account/totp-unenroll
//   body: {} (無)
//   要求：使用者 JWT 必須是 aal2（已通過 TOTP 驗證）
//
// 為何需要 server-side 路徑：
//   client 端 supabase.auth.mfa.unenroll 在 Cloudflare Access preview / 慢網路下
//   觀察到 hang（Promise 不 resolve）或因 verify 後 token cache 同步延遲，
//   導致 unenroll 用 aal1 token 被 gotrue 拒絕。此 endpoint 用 service_role
//   直接呼 RPC 刪 factor，繞過 client SDK 的 token 同步問題。
//
// 安全考量：
// - aal2 入口檢查不可省（防 aal1 token 偷渡停用 2FA）
// - p_user_id 由 server 從 token 解出，client 無法指定別人的 user_id
// - service_role 只能呼叫受限的 RPC（delete_user_totp_factor / get_user_totp_factors）

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { rpc, update } from '../../lib/supabase-server.js';
import { logError, logInfo } from '../../lib/logger.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    const { userId, aal } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ success: false, error: 'unauthenticated' }, 401, request);
    }
    if (aal !== 'aal2') {
        return jsonResponse({ success: false, error: 'aal2_required' }, 403, request);
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ success: false, error: 'supabase not configured' }, 500, request);
    }

    try {
        // 1. 列舉 user 的 totp factors（含 unverified — 一併清乾淨）
        const factorsResult = await rpc(env, 'get_user_totp_factors', { p_user_id: userId });
        if (!factorsResult.ok) {
            await logError(env, 'totp-unenroll', 'list factors rpc failed', {
                userId,
                metadata: { error: factorsResult.error?.slice(0, 500) },
            });
            return jsonResponse({ success: false, error: 'failed' }, 500, request);
        }
        const totpFactors = Array.isArray(factorsResult.data) ? factorsResult.data : [];

        // 2. 逐一刪除 factor（複用 totp-recover 模式：避開 GoTrue admin REST DELETE 不穩定）
        let removed = 0;
        for (const f of totpFactors) {
            const delRes = await rpc(env, 'delete_user_totp_factor', {
                p_user_id: userId,
                p_factor_id: f.id,
            });
            if (delRes.ok && delRes.data === true) removed++;
            else {
                await logError(env, 'totp-unenroll', 'delete factor rpc failed', {
                    userId,
                    metadata: { factor_id: f.id, error: delRes.error?.slice(0, 500) },
                });
            }
        }

        // 3. 清空備援碼（停用 2FA = 備援碼一併失效，避免孤兒備援碼被誤用）
        const updateRes = await update(
            env,
            'user_mfa_secrets',
            `user_id=eq.${encodeURIComponent(userId)}`,
            {
                backup_codes_hashed: [],
                enrolled_at: null,
            },
        );
        if (!updateRes.ok) {
            await logError(env, 'totp-unenroll', 'clear backup codes failed', {
                userId,
                metadata: { status: updateRes.status, error: updateRes.error?.slice(0, 500) },
            });
            // 不致命：factor 已刪，user 不再有 2FA。下次 enroll 會 upsert 覆蓋
        }

        await logInfo(env, 'totp-unenroll', '2fa disabled', {
            userId,
            metadata: { factors_removed: removed, factors_total: totpFactors.length },
        });

        return jsonResponse(
            { success: true, factorsRemoved: removed },
            200,
            request,
            { 'Cache-Control': 'no-store' },
        );
    } catch (err) {
        await logError(env, 'totp-unenroll', 'unexpected', {
            userId,
            metadata: { error: String(err).slice(0, 500) },
        });
        return jsonResponse({ success: false, error: 'failed' }, 500, request);
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
