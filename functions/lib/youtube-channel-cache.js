// Cloudflare Pages Function 共用工具:youtube_channels cache 寫入
//
// 用途:
//   讓所有 scrape 出 channel_id + channel_title 的後端 endpoint 都能順手把
//   channel name 寫進 youtube_channels cache,後續 user 查詢同一頻道時直接從
//   Supabase 拿,**節省 YouTube Data API quota**。
//
// 設計原則:
//   - 匿名可寫(不檢查 caller auth):cache 對所有 user 都有益,不該強迫登入
//   - 防範惡意寫入靠格式驗證 + service_role only RLS:
//     channel_id 必須符合 `UC + 22 字元`,channel_title trim 後限 200 字
//   - 只能寫 `youtube_channels` 一張表(SERVICE_ROLE 僅在此 helper 內使用)
//
// 提供三個 export:
//   1. `sanitizeChannelInput(channelId, channelTitle)`
//        - 同步 sanitize + 驗證,回 `{ channelId, channelTitle }` 或 `null`(無效)
//   2. `writeChannelCacheBackground(env, channelId, channelTitle)`
//        - Fire-and-forget upsert。Caller 應在 `ctx.waitUntil(...)` 內呼叫,
//          避免 worker 提早 terminate。
//        - 失敗只 console.warn,不 throw(不阻塞原 endpoint 回應)
//        - 跳過情境(不動 cache):input 無效、env 缺、PostgREST 5xx
//   3. `writeChannelCacheAwaited(env, channelId, channelTitle)`
//        - 同步 await 版本,給 cache-channel endpoint 用,需要回應 caller
//          upsert 結果。
//        - 回 `{ ok: true, channel: {...} }` 或 `{ ok: false, reason, status? }`

const CHANNEL_ID_REGEX = /^UC[A-Za-z0-9_-]{22}$/;
const CHANNEL_TITLE_MAX_LEN = 200;

/**
 * 驗證 + 標準化 channel cache input
 * @param {unknown} channelId
 * @param {unknown} channelTitle
 * @returns {{ channelId: string, channelTitle: string } | null}
 */
export function sanitizeChannelInput(channelId, channelTitle) {
    if (typeof channelId !== 'string' || !CHANNEL_ID_REGEX.test(channelId)) {
        return null;
    }
    if (typeof channelTitle !== 'string') {
        return null;
    }
    const title = channelTitle.trim().slice(0, CHANNEL_TITLE_MAX_LEN);
    if (!title) {
        return null;
    }
    return { channelId, channelTitle: title };
}

/**
 * 內部:執行 service_role PostgREST upsert
 * @param {{ SUPABASE_URL?: string, SUPABASE_SERVICE_ROLE_KEY?: string }} env
 * @param {string} channelId
 * @param {string} channelTitle
 * @param {boolean} returnRepresentation - true 回傳 row,false 回 minimal
 * @returns {Promise<Response>}
 */
async function postUpsert(env, channelId, channelTitle, returnRepresentation) {
    const upsertUrl = `${env.SUPABASE_URL}/rest/v1/youtube_channels?on_conflict=channel_id`;
    const preferReturn = returnRepresentation ? 'return=representation' : 'return=minimal';
    return fetch(upsertUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: `resolution=merge-duplicates,${preferReturn}`,
        },
        body: JSON.stringify({
            channel_id: channelId,
            channel_title: channelTitle,
            fetched_at: new Date().toISOString(),
        }),
    });
}

/**
 * Fire-and-forget upsert(背景執行,不阻塞 caller)。
 *
 * 適用場景:scrape endpoint 已備好回應,順手寫 cache 不該影響回應時間。
 * Caller 應包在 `ctx.waitUntil(writeChannelCacheBackground(...))` 內,
 * 確保 worker terminate 前能完成寫入。
 *
 * @param {{ SUPABASE_URL?: string, SUPABASE_SERVICE_ROLE_KEY?: string }} env
 * @param {unknown} channelId
 * @param {unknown} channelTitle
 * @returns {Promise<void>}
 */
export async function writeChannelCacheBackground(env, channelId, channelTitle) {
    const sanitized = sanitizeChannelInput(channelId, channelTitle);
    if (!sanitized) return;
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return;

    try {
        const res = await postUpsert(env, sanitized.channelId, sanitized.channelTitle, false);
        if (!res.ok) {
            // 不 throw,只記錄 status(避免洩漏 schema 細節)
            console.warn('[youtube cache] background upsert non-2xx:', res.status);
        }
    } catch (e) {
        console.warn('[youtube cache] background write failed:', e?.message || e);
    }
}

/**
 * 同步 await 版本。給需要回應 caller upsert 結果的 endpoint 用
 * (例如 `/api/youtube/cache-channel`)。
 *
 * @param {{ SUPABASE_URL?: string, SUPABASE_SERVICE_ROLE_KEY?: string }} env
 * @param {unknown} channelId
 * @param {unknown} channelTitle
 * @returns {Promise<
 *   { ok: true, channel: { channel_id: string, channel_title: string, fetched_at: string } }
 *   | { ok: false, reason: string, status?: number }
 * >}
 */
export async function writeChannelCacheAwaited(env, channelId, channelTitle) {
    if (typeof channelId !== 'string' || !CHANNEL_ID_REGEX.test(channelId)) {
        return { ok: false, reason: 'invalid_channel_id' };
    }
    if (typeof channelTitle !== 'string' || channelTitle.trim().length === 0) {
        return { ok: false, reason: 'invalid_channel_title' };
    }
    const title = channelTitle.trim().slice(0, CHANNEL_TITLE_MAX_LEN);

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return { ok: false, reason: 'server_misconfigured' };
    }

    let res;
    try {
        res = await postUpsert(env, channelId, title, true);
    } catch {
        return { ok: false, reason: 'db_error' };
    }

    if (!res.ok) {
        return { ok: false, reason: 'db_error', status: res.status };
    }

    return {
        ok: true,
        channel: {
            channel_id: channelId,
            channel_title: title,
            fetched_at: new Date().toISOString(),
        },
    };
}
