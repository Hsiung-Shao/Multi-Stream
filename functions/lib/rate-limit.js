// IP-based rate limit（Cloudflare KV）
// 用於匿名投稿；登入用戶走 DB 端 increment_contribution_quota RPC
//
// Key 格式：
//   contrib:<type>:<scope>:<ip>:<bucket>
//   - type: vtuber | event
//   - scope: hour | day
//   - ip: CF-Connecting-IP
//   - bucket: hour: YYYYMMDDHH, day: YYYYMMDD

export const RATE_LIMITS = {
    vtuber: {
        anon: { hour: 3, day: 10 },
        user: { day: 20 }, // user 由 DB RPC 處理 day 上限；hour 不額外限
    },
    event: {
        anon: { hour: 1, day: 2 },
        user: { day: 5 },
    },
};

function pad2(n) { return String(n).padStart(2, '0'); }

function nowBuckets() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = pad2(d.getUTCMonth() + 1);
    const day = pad2(d.getUTCDate());
    const hour = pad2(d.getUTCHours());
    return { day: `${y}${m}${day}`, hour: `${y}${m}${day}${hour}` };
}

/**
 * 檢查並計數匿名 IP 的 rate limit
 * @param {KVNamespace} kv
 * @param {string} ip
 * @param {'vtuber'|'event'} type
 * @returns {Promise<{ allowed: boolean, reason?: string, current: { hour: number, day: number }, limit: { hour: number, day: number } }>}
 */
export async function checkAndIncrementAnonQuota(kv, ip, type) {
    if (!ip) {
        // 沒 IP 視同未通過（保守做法）
        return {
            allowed: false,
            reason: 'no_ip',
            current: { hour: 0, day: 0 },
            limit: RATE_LIMITS[type].anon,
        };
    }
    const limits = RATE_LIMITS[type].anon;
    const { hour: hourBucket, day: dayBucket } = nowBuckets();

    const hourKey = `contrib:${type}:hour:${ip}:${hourBucket}`;
    const dayKey = `contrib:${type}:day:${ip}:${dayBucket}`;

    const [hourRaw, dayRaw] = await Promise.all([kv.get(hourKey), kv.get(dayKey)]);
    const hourCount = parseInt(hourRaw || '0', 10);
    const dayCount = parseInt(dayRaw || '0', 10);

    if (hourCount >= limits.hour) {
        return {
            allowed: false,
            reason: 'hour_limit',
            current: { hour: hourCount, day: dayCount },
            limit: limits,
        };
    }
    if (dayCount >= limits.day) {
        return {
            allowed: false,
            reason: 'day_limit',
            current: { hour: hourCount, day: dayCount },
            limit: limits,
        };
    }

    // 寫入：計數 +1，TTL 設為超過 bucket 結束的時間
    await Promise.all([
        kv.put(hourKey, String(hourCount + 1), { expirationTtl: 3700 }),       // ~1h + buffer
        kv.put(dayKey, String(dayCount + 1), { expirationTtl: 90000 }),         // ~25h + buffer
    ]);

    return {
        allowed: true,
        current: { hour: hourCount + 1, day: dayCount + 1 },
        limit: limits,
    };
}

/**
 * 取訪客 IP（Cloudflare 自動帶 CF-Connecting-IP）
 * @param {Request} request
 * @returns {string}
 */
export function getVisitorIp(request) {
    return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || '';
}

/**
 * 檢查 IP 是否在 banlist（env.BANNED_IPS 逗號分隔）
 * @param {Object} env
 * @param {string} ip
 * @returns {boolean}
 */
export function isIpBanned(env, ip) {
    if (!ip || !env.BANNED_IPS) return false;
    return env.BANNED_IPS.split(',').map(s => s.trim()).includes(ip);
}
