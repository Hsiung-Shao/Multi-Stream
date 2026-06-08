// Server-side Supabase 操作（Cloudflare Pages Function 用）
// 用 SERVICE_ROLE_KEY 走 PostgREST，繞過 RLS（仰賴 Function 自己做權限控制）
// 不引入 @supabase/supabase-js，避免 bundle 變大、減少冷啟動延遲

/**
 * 呼叫 Supabase RPC function
 * @param {Object} env - Cloudflare Function env
 * @param {string} fnName - RPC function 名稱
 * @param {Object} params - RPC 參數
 * @returns {Promise<{ ok: boolean, status: number, data: any, error: string|null }>}
 */
export async function rpc(env, fnName, params) {
    const url = `${env.SUPABASE_URL}/rest/v1/rpc/${fnName}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify(params),
        });
        const data = res.ok ? await res.json() : null;
        const error = res.ok ? null : await res.text();
        return { ok: res.ok, status: res.status, data, error };
    } catch (e) {
        return { ok: false, status: 500, data: null, error: String(e) };
    }
}

/**
 * 用 service_role 寫入 row
 * @param {Object} env
 * @param {string} table
 * @param {Object} row
 * @returns {Promise<{ ok, status, data, error }>}
 */
export async function insert(env, table, row) {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Prefer': 'return=representation',
            },
            body: JSON.stringify(row),
        });
        const data = res.ok ? await res.json() : null;
        const error = res.ok ? null : await res.text();
        return { ok: res.ok, status: res.status, data, error };
    } catch (e) {
        return { ok: false, status: 500, data: null, error: String(e) };
    }
}

/**
 * 用 service_role 更新 row
 * @param {Object} env
 * @param {string} table
 * @param {string} filter - PostgREST filter，例如 `id=eq.xxx`
 * @param {Object} patch
 * @returns {Promise<{ ok, status, data, error }>}
 */
export async function update(env, table, filter, patch) {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}?${filter}`;
    try {
        const res = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Prefer': 'return=representation',
            },
            body: JSON.stringify(patch),
        });
        const data = res.ok ? await res.json() : null;
        const error = res.ok ? null : await res.text();
        return { ok: res.ok, status: res.status, data, error };
    } catch (e) {
        return { ok: false, status: 500, data: null, error: String(e) };
    }
}

/**
 * 用 service_role 查詢 row（單筆或多筆）
 * @param {Object} env
 * @param {string} tableWithQuery - 例：`user_profiles?supabase_auth_id=eq.xxx&select=trust_level`
 * @returns {Promise<{ ok, status, data, error }>}
 */
export async function select(env, tableWithQuery) {
    const url = `${env.SUPABASE_URL}/rest/v1/${tableWithQuery}`;
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
        });
        const data = res.ok ? await res.json() : null;
        const error = res.ok ? null : await res.text();
        return { ok: res.ok, status: res.status, data, error };
    } catch (e) {
        return { ok: false, status: 500, data: null, error: String(e) };
    }
}
