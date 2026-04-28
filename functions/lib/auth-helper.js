// JWT 驗證 + 權限檢查工具
//
// 不自己驗章。改用 Supabase Auth REST /auth/v1/user 端點：把 user 帶來的
// JWT 與 apikey (service_role) 一起送過去，Supabase 內部驗證後回傳 user。
//
// 好處：
// 1. 兼容 HS256 / ES256 / 未來任何新算法 — Supabase 自己處理
// 2. 不需 SUPABASE_JWT_SECRET（已棄用 — Supabase 升級到 JWT Signing Keys）
// 3. 不需實作 JWKS / ES256 ECDSA 驗章
//
// 代價：每次登入用戶請求多 1 次 Supabase Auth HTTP call（~50-150ms）
// 對 anti-spam 投稿場景完全可接受。

import { rpc, select } from './supabase-server.js';

/**
 * 從 Authorization header 解出 user_id（auth.users.id）
 * 用 Supabase Auth REST /auth/v1/user 驗證 JWT 並取出 user
 *
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
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return { userId: null, verified: false };
    }

    try {
        const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            },
        });
        // 401/403 → token 無效；只回傳結果，不暴露細節
        if (!res.ok) {
            return { userId: null, verified: false };
        }
        const user = await res.json();
        return {
            userId: typeof user?.id === 'string' ? user.id : null,
            verified: true,
        };
    } catch {
        return { userId: null, verified: false };
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
