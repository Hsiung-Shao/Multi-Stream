// JWT 解析與權限檢查工具
//
// 預設用 base64 decode 取 sub（不驗章，信任 Cloudflare 邊緣）
// 若 env.SUPABASE_JWT_SECRET 有設則用 HS256 驗章，更嚴格
//
// JWT payload sub = user UUID（auth.users.id），對應 user_profiles.supabase_auth_id

import { rpc, select } from './supabase-server.js';

/**
 * 從 Authorization header 解出 user_id（auth.users.id）
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<{ userId: string|null, verified: boolean }>}
 */
export async function getUserIdFromRequest(request, env) {
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return { userId: null, verified: false };
    }
    const token = authHeader.slice(7).trim();
    if (!token || token.split('.').length !== 3) {
        return { userId: null, verified: false };
    }

    let verified = false;
    if (env.SUPABASE_JWT_SECRET) {
        try {
            verified = await verifyHs256(token, env.SUPABASE_JWT_SECRET);
        } catch {
            verified = false;
        }
        if (!verified) {
            return { userId: null, verified: false };
        }
    }

    try {
        const [, payloadB64] = token.split('.');
        const payload = JSON.parse(base64UrlDecode(payloadB64));
        const sub = payload && typeof payload.sub === 'string' ? payload.sub : null;
        // 過期檢查（不論驗章與否都做）
        if (payload && typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
            return { userId: null, verified };
        }
        return { userId: sub, verified };
    } catch {
        return { userId: null, verified };
    }
}

/**
 * 取得使用者 trust_level（'new' | 'trusted' | 'moderator' | 'admin' | 'banned'）
 * @param {Object} env
 * @param {string} userId - auth.users.id
 * @returns {Promise<string>}
 */
export async function getTrustLevel(env, userId) {
    if (!userId) return 'new';
    const { data, ok } = await select(
        env,
        `user_profiles?supabase_auth_id=eq.${encodeURIComponent(userId)}&select=trust_level&limit=1`,
    );
    if (!ok || !Array.isArray(data) || data.length === 0) return 'new';
    return data[0].trust_level || 'new';
}

/**
 * 呼叫 increment_contribution_quota RPC
 * @param {Object} env
 * @param {string} userId
 * @param {'vtuber'|'event'} type
 * @param {number} quota - 每日上限
 * @returns {Promise<{ allowed: boolean, newCount: number, quotaLimit: number, error: string|null }>}
 */
export async function checkAndIncrementQuota(env, userId, type, quota) {
    const result = await rpc(env, 'increment_contribution_quota', {
        p_user_id: userId,
        p_type: type,
        p_quota: quota,
    });
    if (!result.ok) {
        return { allowed: false, newCount: 0, quotaLimit: quota, error: result.error };
    }
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return {
        allowed: !!row?.allowed,
        newCount: row?.new_count ?? 0,
        quotaLimit: row?.quota_limit ?? quota,
        error: null,
    };
}

// ===== JWT 工具 =====

function base64UrlDecode(str) {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - (str.length % 4)) % 4, '=');
    return atob(padded);
}

async function verifyHs256(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const data = `${parts[0]}.${parts[1]}`;
    const sig = base64UrlDecode(parts[2]);
    const sigBytes = new Uint8Array(sig.length);
    for (let i = 0; i < sig.length; i++) sigBytes[i] = sig.charCodeAt(i);

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
    );
    return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
}
