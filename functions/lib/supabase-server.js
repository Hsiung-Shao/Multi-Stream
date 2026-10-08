// Server-side Supabase 操作(Cloudflare Pages Function 用)
// 用 SERVICE_ROLE_KEY 走 PostgREST,繞過 RLS(仰賴 Function 自己做權限控制)
// 不引入 @supabase/supabase-js,避免 bundle 變大、減少冷啟動延遲

/**
 * 共用核心:組 service_role headers、送出、把結果正規化成
 * { ok, status, data, error, headers }
 *
 * @param {Object} env
 * @param {string} path - `rest/v1/` 之後的路徑(可含 query string)
 * @param {{ method?: string, body?: any, prefer?: string, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, data: any, error: string|null, headers?: Headers }>}
 */
async function sbFetch(env, path, opts = {}) {
    const { method = 'GET', body, prefer, signal } = opts;
    const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
    const headers = {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers['Prefer'] = prefer;
    try {
        const res = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            // 選用的逾時／取消訊號（例如 /api/status 用 AbortSignal.timeout，避免 DB 卡住拖住整個 isolate）
            ...(signal ? { signal } : {}),
        });
        // Prefer: return=minimal 的成功回應是空 body，無條件 res.json() 會丟 SyntaxError，
        // 讓「其實已寫入」的 upsert 被回報成失敗（memory error_postgrest_upsert_not_null_and_empty_body；
        // 當初只修在 next 分支，main 一直沒有）。先讀文字，非空才解析。
        const text = await res.text();
        if (!res.ok) {
            return { ok: false, status: res.status, data: null, error: text, headers: res.headers };
        }
        const data = text ? JSON.parse(text) : null;
        return { ok: true, status: res.status, data, error: null, headers: res.headers };
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
export function insert(env, table, row) {
    return sbFetch(env, table, { method: 'POST', body: row, prefer: 'return=representation' });
}

/**
 * 用 service_role 更新 row
 * @param {Object} env
 * @param {string} table
 * @param {string} filter - PostgREST filter,例如 `id=eq.xxx`
 * @param {Object} patch
 * @returns {Promise<{ ok, status, data, error }>}
 */
export function update(env, table, filter, patch) {
    return sbFetch(env, `${table}?${filter}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
}

/**
 * 用 service_role 查詢 row(單筆或多筆)
 * @param {Object} env
 * @param {string} tableWithQuery - 例:`user_profiles?supabase_auth_id=eq.xxx&select=trust_level`
 * @param {{ prefer?: string }} [opts] - 例:`{ prefer: 'count=exact' }`(total 在回傳 headers 的 Content-Range)
 * @returns {Promise<{ ok, status, data, error, headers? }>}
 */
export function select(env, tableWithQuery, opts = {}) {
    return sbFetch(env, tableWithQuery, { prefer: opts.prefer, signal: opts.signal });
}

/**
 * 用 service_role 刪除 row
 * @param {Object} env
 * @param {string} table
 * @param {string} filter - PostgREST filter,例如 `id=eq.xxx`
 * @returns {Promise<{ ok, status, data, error }>} data 為被刪除的 rows(return=representation)
 */
export function remove(env, table, filter) {
    return sbFetch(env, `${table}?${filter}`, { method: 'DELETE', prefer: 'return=representation' });
}

/**
 * 用 service_role 呼叫 Postgres 函式(PostgREST /rpc)
 * 函式丟出的 exception 會以 ok=false 回傳,error 是 PostgREST 的 JSON 文字(含 message、code)
 * @param {Object} env
 * @param {string} fn - 函式名稱
 * @param {Object} args - 具名參數
 * @returns {Promise<{ ok, status, data, error }>}
 */
export function rpc(env, fn, args = {}) {
    return sbFetch(env, `rpc/${fn}`, { method: 'POST', body: args });
}

/**
 * 用 service_role 批次 upsert(on_conflict),取代逐筆 insert/update 的 N 次呼叫
 * @param {Object} env
 * @param {string} table
 * @param {Object[]} rows - 每筆欄位集須一致,缺的 key 在 merge-duplicates 下會被視為 NULL 寫入
 * @param {{ onConflict?: string, ignoreDuplicates?: boolean }} [opts]
 *   - onConflict: 衝突鍵欄位,預設 'id'
 *   - ignoreDuplicates: true 時撞衝突鍵直接略過(用於「已存在就不動」的批次寫入,例如日期唯一索引防重複快照);
 *     false(預設)時撞衝突鍵會 merge 覆蓋提供的欄位
 * @returns {Promise<{ ok, status, data, error }>}
 */
export function upsert(env, table, rows, opts = {}) {
    const { onConflict = 'id', ignoreDuplicates = false } = opts;
    const resolution = ignoreDuplicates ? 'ignore-duplicates' : 'merge-duplicates';
    return sbFetch(env, `${table}?on_conflict=${onConflict}`, {
        method: 'POST',
        body: rows,
        prefer: `resolution=${resolution},return=minimal`,
    });
}
