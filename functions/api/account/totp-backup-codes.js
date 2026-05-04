// Cloudflare Pages Function：產生 / 重新產生 2FA 備援碼
//
// POST /api/account/totp-backup-codes
//   body: {} (無)
//   要求：使用者 JWT 必須是 aal2（已通過 TOTP 驗證）
//
// 流程：
// 1. 驗 JWT 取 user_id + 確認 aal2
// 2. 產生 8 組 plain code，雜湊後存入 user_mfa_secrets
// 3. 回傳 plain codes（**只此一次**，重整即看不到）
//
// 為何要求 aal2：
//   防止別人偷到 aal1 token 後直接重新產生備援碼來繞過 2FA。
//   要走完整 TOTP 驗證 → 升 aal2 → 才能看 / 重新產生 codes。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { logError } from '../../lib/logger.js';
import { generateBackupCodes, hashBackupCodes } from '../../lib/backup-codes.js';

async function getVerifiedUser(request, env) {
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token || token.split('.').length !== 3) return null;
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return null;

    try {
        const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            },
        });
        if (!res.ok) return null;
        const user = await res.json();
        // 解 JWT payload 取 aal（不驗章 — 上面 /auth/v1/user 已驗章）
        let aal = 'aal1';
        try {
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            aal = payload?.aal || 'aal1';
        } catch { /* ignore */ }
        return { userId: user?.id, aal };
    } catch {
        return null;
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const verified = await getVerifiedUser(request, env);
    if (!verified?.userId) {
        return jsonResponse({ success: false, error: 'unauthenticated' }, 401, request);
    }
    if (verified.aal !== 'aal2') {
        return jsonResponse({ success: false, error: 'aal2_required' }, 403, request);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ success: false, error: 'supabase not configured' }, 500, request);
    }

    try {
        const codes = generateBackupCodes();
        const hashed = await hashBackupCodes(codes);

        // upsert user_mfa_secrets（user_id 為 PK）
        const url = `${env.SUPABASE_URL}/rest/v1/user_mfa_secrets`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify({
                user_id: verified.userId,
                backup_codes_hashed: hashed,
                enrolled_at: new Date().toISOString(),
            }),
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            await logError(env, 'totp-backup-codes', 'upsert failed', {
                userId: verified.userId,
                metadata: { status: res.status, error: errText.slice(0, 500) },
            });
            return jsonResponse({ success: false, error: 'failed' }, 500, request);
        }

        return jsonResponse(
            { success: true, codes }, // plain codes 只回這一次
            200,
            request,
            { 'Cache-Control': 'no-store' },
        );
    } catch (err) {
        await logError(env, 'totp-backup-codes', 'unexpected', {
            userId: verified.userId,
            metadata: { error: String(err).slice(0, 500) },
        });
        return jsonResponse({ success: false, error: 'failed' }, 500, request);
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
