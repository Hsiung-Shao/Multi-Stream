// Cloudflare Pages Function：更新 display_name
//
// POST /api/account/update-display-name { displayName: string }
//
// 流程：
// 1. 驗 JWT 取 user_id
// 2. NFKC normalize + 字元黑名單 + 長度檢查
// 3. KV rate limit（每 user 每日 5 次，避免被濫用刷名）
// 4. 用 service_role 更新 user_profiles.display_name
//
// 環境變數：env.RATE_LIMIT_KV / env.SUPABASE_URL / env.SUPABASE_SERVICE_ROLE_KEY

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { update } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';
import { normalizeDisplayName, validateDisplayName } from '../../lib/displayName.js';

const MAX_BODY_BYTES = 4 * 1024;
const DAILY_LIMIT = 5;

function todayBucket() {
    const d = new Date();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 每 user 每天最多改 5 次
 * @returns {Promise<{ allowed: boolean, count: number }>}
 */
async function checkAndIncrementRename(kv, userId) {
    if (!kv) return { allowed: true, count: 0 }; // KV 沒設則略過（仍有 server side validate）
    const key = `rename:${userId}:${todayBucket()}`;
    const raw = await kv.get(key);
    const count = parseInt(raw || '0', 10);
    if (count >= DAILY_LIMIT) return { allowed: false, count };
    await kv.put(key, String(count + 1), { expirationTtl: 90000 });
    return { allowed: true, count: count + 1 };
}

export async function onRequestPost(context) {
    const { request, env } = context;

    // 1. Auth
    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ success: false, error: 'unauthenticated' }, 401, request);
    }

    // 2. Body
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return jsonResponse({ success: false, error: 'Invalid Content-Type' }, 400, request);
    }
    if (parseInt(request.headers.get('Content-Length') || '0', 10) > MAX_BODY_BYTES) {
        return jsonResponse({ success: false, error: 'Body too large' }, 413, request);
    }
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ success: false, error: '無效的 JSON' }, 400, request);
    }

    // 3. Normalize + validate
    const normalized = normalizeDisplayName(body?.displayName);
    const validationError = validateDisplayName(normalized);
    if (validationError) {
        return jsonResponse({ success: false, errorCode: validationError }, 400, request);
    }

    // 4. Rate limit
    const limit = await checkAndIncrementRename(env.RATE_LIMIT_KV, userId);
    if (!limit.allowed) {
        return jsonResponse({
            success: false,
            error: `本日修改次數已達上限 (${DAILY_LIMIT})，請明天再試`,
        }, 429, request);
    }

    // 5. 寫入 user_profiles
    const updateRes = await update(
        env,
        'user_profiles',
        `supabase_auth_id=eq.${encodeURIComponent(userId)}`,
        { display_name: normalized },
    );
    if (!updateRes.ok) {
        await logError(env, 'update-display-name', 'update user_profiles failed', {
            userId,
            metadata: { status: updateRes.status, error: updateRes.error?.slice(0, 500) },
        });
        return jsonResponse({ success: false, error: '更新失敗，請稍後再試' }, 500, request);
    }

    return jsonResponse({
        success: true,
        displayName: normalized,
        remaining: Math.max(0, DAILY_LIMIT - limit.count),
    }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
