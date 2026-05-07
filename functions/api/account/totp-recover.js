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
import { rpc, select, update } from '../../lib/supabase-server.js';
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
        // 1. 先確認 user 還有 totp factor — 沒 factor 就沒得 recover，直接拒絕
        //    （避免孤兒備援碼被誤用：unenroll 後 backup_codes 殘留時若不檢查，
        //     user 可消耗備援碼但其實沒任何效果）
        const factorsResult = await rpc(env, 'get_user_totp_factors', { p_user_id: userId });
        if (!factorsResult.ok) {
            await logError(env, 'totp-recover', 'list factors rpc failed', {
                userId,
                metadata: { error: factorsResult.error?.slice(0, 500) },
            });
            return jsonResponse({ success: false, error: 'failed' }, 500, request);
        }
        const totpFactors = Array.isArray(factorsResult.data) ? factorsResult.data : [];
        if (totpFactors.length === 0) {
            return jsonResponse({ success: false, error: 'no_factor_to_recover' }, 404, request);
        }

        // 2. 取備援碼 hash 列表
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

        // 3. 比對備援碼 — 失敗不消耗
        const { matched, remaining } = await consumeBackupCode(stored, body.code);
        if (!matched) {
            return jsonResponse({ success: false, error: 'invalid_code' }, 400, request);
        }

        // 4. 用 RPC 逐一刪 totp factor（避開不穩定的 GoTrue admin REST DELETE）
        let deletedCount = 0;
        for (const f of totpFactors) {
            const delRes = await rpc(env, 'delete_user_totp_factor', {
                p_user_id: userId,
                p_factor_id: f.id,
            });
            if (delRes.ok && delRes.data === true) deletedCount++;
            else {
                await logError(env, 'totp-recover', 'delete factor rpc failed', {
                    userId,
                    metadata: { factor_id: f.id, error: delRes.error?.slice(0, 500) },
                });
            }
        }

        // 5. 更新 backup_codes_hashed + recovered stats（即使部分 factor 刪失敗也消耗 code，
        //    避免 replay；user 看回傳資訊知道狀態）
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
            metadata: { remaining: remaining.length, factors_deleted: deletedCount, factors_total: totpFactors.length },
        });

        return jsonResponse({
            success: true,
            remaining: remaining.length,
            factorsRemoved: deletedCount,
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
