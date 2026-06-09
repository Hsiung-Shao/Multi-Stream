// JWT 驗證 + admin gate 工具
//
// 不自己驗章。改用 Supabase Auth REST /auth/v1/user 端點:把 user 帶來的
// JWT 與 apikey (service_role) 一起送過去,Supabase 內部驗證後回傳 user。
//
// 好處:
// 1. 兼容 HS256 / ES256 / 未來任何新算法 — Supabase 自己處理
// 2. 不需 SUPABASE_JWT_SECRET(已棄用 — Supabase 升級到 JWT Signing Keys)
// 3. 不需實作 JWKS / ES256 ECDSA 驗章
//
// 代價:每次登入用戶請求多 1 次 Supabase Auth HTTP call(~50-150ms)
// 對 anti-spam 投稿場景完全可接受。

import { jsonResponse } from './cors.js';

/**
 * 從 JWT payload base64 解出 aal(不驗章 — 呼叫端 已經/將要 走 Supabase Auth REST 驗章)
 * @param {string} token
 * @returns {'aal1' | 'aal2'}
 */
function decodeAal(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload?.aal === 'aal2' ? 'aal2' : 'aal1';
    } catch {
        return 'aal1';
    }
}

/**
 * 從 Authorization header 解出 user_id(auth.users.id)
 * 用 Supabase Auth REST /auth/v1/user 驗證 JWT 並取出 user
 *
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<{ userId: string|null, verified: boolean, aal: 'aal1'|'aal2' }>}
 */
export async function getUserIdFromRequest(request, env) {
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return { userId: null, verified: false, aal: 'aal1' };
    }
    const token = authHeader.slice(7).trim();
    if (!token || token.split('.').length !== 3) {
        return { userId: null, verified: false, aal: 'aal1' };
    }
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return { userId: null, verified: false, aal: 'aal1' };
    }

    try {
        const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            },
        });
        // 401/403 → token 無效;只回傳結果,不暴露細節
        if (!res.ok) {
            return { userId: null, verified: false, aal: 'aal1' };
        }
        const user = await res.json();
        return {
            userId: typeof user?.id === 'string' ? user.id : null,
            verified: true,
            aal: decodeAal(token),
        };
    } catch {
        return { userId: null, verified: false, aal: 'aal1' };
    }
}

/**
 * Admin API 簡易 gate:用 ADMIN_API_TOKEN 環境變數驗證(X-Admin-Token header)。
 * 不接帳號系統 / 2FA(見 ROADMAP);所有寫入仍以 service_role 進行(繞過 RLS)。
 *
 * @param {Request} request
 * @param {Object} env
 * @returns {{ ok: true } | { ok: false, response: Response }}
 */
export function gateAdmin(request, env) {
    const expected = env?.ADMIN_API_TOKEN;
    if (!expected) {
        // 後端未設定 token → 安全預設為拒絕
        return { ok: false, response: jsonResponse({ ok: false, error: 'admin_not_configured' }, 503, request) };
    }
    const provided = request.headers.get('X-Admin-Token') || '';
    if (provided.length !== expected.length || provided !== expected) {
        return { ok: false, response: jsonResponse({ ok: false, error: 'unauthorized' }, 401, request) };
    }
    return { ok: true };
}
