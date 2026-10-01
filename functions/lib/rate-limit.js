// 請求來源工具:訪客 IP 取得 + IP banlist
// (per-endpoint 的 KV rate limit 計數器見各功能 lib,例如 lib/announcements.js)

/**
 * 取訪客 IP(Cloudflare 自動帶 CF-Connecting-IP)
 */
export function getVisitorIp(request) {
    return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || '';
}

/**
 * 檢查 IP 是否在 banlist(env.BANNED_IPS 逗號分隔)
 */
export function isIpBanned(env, ip) {
    if (!ip || !env.BANNED_IPS) return false;
    return env.BANNED_IPS.split(',').map(s => s.trim()).filter(Boolean).includes(ip);
}

/**
 * IP 加鹽雜湊(sha256 hex):限流 key 與資料表都只存這個,不存原始 IP。
 * 沒設 IP_HASH_SALT 時仍可運作(本地開發),只是雜湊可被字典反推。
 * @param {Object} env
 * @param {string} ip
 * @returns {Promise<string>} 64 字元 hex;沒有 IP 時回 'unknown'
 */
export async function hashIp(env, ip) {
    if (!ip) return 'unknown';
    const data = new TextEncoder().encode(`${env?.IP_HASH_SALT || ''}:${ip}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * KV 計數型配額:未達上限就 +1 並回 true;達上限回 false。
 * KV 是最終一致,並發下上限只是大約值(主要防線是 Turnstile);沒有 KV 時放行(與 feedback 一致)。
 * @param {KVNamespace|undefined} kv
 * @param {string} key
 * @param {number} limit
 * @param {number} ttlSeconds - KV 最短 60 秒
 * @returns {Promise<boolean>}
 */
export async function checkKvQuota(kv, key, limit, ttlSeconds) {
    if (!kv) return true;
    const count = parseInt((await kv.get(key)) || '0', 10);
    if (count >= limit) return false;
    await kv.put(key, String(count + 1), { expirationTtl: Math.max(60, ttlSeconds) });
    return true;
}

/** 限流 key 的時間片段:小時 'YYYYMMDDHH'、天 'YYYYMMDD'(UTC) */
export function quotaWindow(now = Date.now()) {
    const iso = new Date(now).toISOString();
    return { hour: iso.slice(0, 13).replace(/[-T]/g, ''), day: iso.slice(0, 10).replace(/-/g, '') };
}

/**
 * 依序檢查多個配額(個人每小時、個人每天、全站每小時…),任一達上限就停(已加的計數不回滾,屬可接受的近似)。
 * @param {KVNamespace|undefined} kv
 * @param {{ key: string, limit: number, ttl: number }[]} rules
 * @returns {Promise<{ ok: true } | { ok: false, key: string }>}
 */
export async function checkQuotas(kv, rules) {
    for (const r of rules) {
        if (!(await checkKvQuota(kv, r.key, r.limit, r.ttl))) return { ok: false, key: r.key };
    }
    return { ok: true };
}
