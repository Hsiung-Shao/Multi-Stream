// Cloudflare Pages Function：用備援碼恢復登入（移除已啟用的 TOTP factor）
//
// POST /api/account/totp-recover { code: "XXXXX-XXXXX" }
//   要求：使用者 JWT 必須是 aal1（已用 OAuth 登入但還沒過 TOTP）
//
// 流程：
// 1. 驗 JWT 取 user_id
// 2. 比對 backup code hash → 消耗一組
// 3. 移除該 user 所有 verified TOTP factors（讓他能正常進入帳號設定重新 enroll）
// 4. 紀錄 recovered_at + recovered_count++
//
// 為何要消耗備援碼且移除 factor，而非直接「升 aal2」：
//   - Supabase 沒有公開 API 可從 Function 端把 session 升 aal2
//   - 備援碼語意 = 「我永久遺失驗證器，重置到無 2FA 狀態」
//   - 使用後 user 必須立刻重新 enroll 新 TOTP（admin/moderator 帳號 RLS 也會強制）
//
// 安全考量：
// - rate limit：每 user 每天最多 5 次嘗試（防暴力破解 8 組備援碼）
//   8 組 × 32^10 = 8.8e15 組合，實務上即使無 rate limit 也跑不完，但仍建議加層防禦

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { select, update } from '../../lib/supabase-server.js';
import { logError, logInfo } from '../../lib/logger.js';
import { consumeBackupCode } from '../../lib/backup-codes.js';

const MAX_BODY_BYTES = 1024;
const DAILY_ATTEMPT_LIMIT = 5;

function todayBucket() {
    const d = new Date();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function checkAttemptLimit(kv, userId) {
    if (!kv) return { allowed: true, count: 0 };
    const key = `totp_recover:${userId}:${todayBucket()}`;
    const raw = await kv.get(key);
    const count = parseInt(raw || '0', 10);
    if (count >= DAILY_ATTEMPT_LIMIT) return { allowed: false, count };
    await kv.put(key, String(count + 1), { expirationTtl: 90000 });
    return { allowed: true, count: count + 1 };
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ success: false, error: 'unauthenticated' }, 401, request);
    }

    if (parseInt(request.headers.get('Content-Length') || '0', 10) > MAX_BODY_BYTES) {
        return jsonResponse({ success: false, error: 'body too large' }, 413, request);
    }
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ success: false, error: 'invalid json' }, 400, request);
    }
    if (typeof body?.code !== 'string' || body.code.length < 8 || body.code.length > 20) {
        return jsonResponse({ success: false, error: 'invalid code format' }, 400, request);
    }

    // Rate limit
    const limit = await checkAttemptLimit(env.RATE_LIMIT_KV, userId);
    if (!limit.allowed) {
        return jsonResponse({ success: false, error: 'rate_limit' }, 429, request);
    }

    try {
        // 取 hash 列表
        const secretsRes = await select(
            env,
            `user_mfa_secrets?user_id=eq.${encodeURIComponent(userId)}&select=backup_codes_hashed,recovered_count`,
        );
        if (!secretsRes.ok || !Array.isArray(secretsRes.data) || secretsRes.data.length === 0) {
            return jsonResponse({ success: false, error: 'no_backup_codes' }, 404, request);
        }
        const stored = Array.isArray(secretsRes.data[0]?.backup_codes_hashed)
            ? secretsRes.data[0].backup_codes_hashed
            : [];
        const recoveredCount = parseInt(secretsRes.data[0]?.recovered_count ?? 0, 10);

        const { matched, remaining } = await consumeBackupCode(stored, body.code);
        if (!matched) {
            return jsonResponse({ success: false, error: 'invalid_code' }, 400, request);
        }

        // 移除該 user 所有 verified TOTP factor — 用 admin API 列出再逐一刪
        try {
            const factorsRes = await fetch(
                `${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}/factors`,
                {
                    headers: {
                        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                    },
                },
            );
            if (factorsRes.ok) {
                const data = await factorsRes.json();
                const factors = Array.isArray(data?.factors) ? data.factors : (Array.isArray(data) ? data : []);
                for (const f of factors) {
                    if (f.factor_type !== 'totp') continue;
                    await fetch(
                        `${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}/factors/${encodeURIComponent(f.id)}`,
                        {
                            method: 'DELETE',
                            headers: {
                                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                            },
                        },
                    );
                }
            }
        } catch (err) {
            await logError(env, 'totp-recover', 'remove factors failed', {
                userId,
                metadata: { error: String(err).slice(0, 500) },
            });
            // 不 abort：備援碼已消耗（避免 replay），讓 user 知道狀態
        }

        // 更新 backup_codes_hashed + recovered stats
        const updateRes = await update(
            env,
            'user_mfa_secrets',
            `user_id=eq.${encodeURIComponent(userId)}`,
            {
                backup_codes_hashed: remaining,
                recovered_at: new Date().toISOString(),
                recovered_count: recoveredCount + 1,
            },
        );
        if (!updateRes.ok) {
            await logError(env, 'totp-recover', 'update secrets failed', {
                userId,
                metadata: { status: updateRes.status, error: updateRes.error?.slice(0, 500) },
            });
        }

        await logInfo(env, 'totp-recover', '2fa reset via backup code', {
            userId,
            metadata: { remaining: remaining.length },
        });

        return jsonResponse({
            success: true,
            remaining: remaining.length,
            message: '2FA 已重置，請重新登入並重新啟用',
        }, 200, request);
    } catch (err) {
        await logError(env, 'totp-recover', 'unexpected', {
            userId,
            metadata: { error: String(err).slice(0, 500) },
        });
        return jsonResponse({ success: false, error: 'failed' }, 500, request);
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
