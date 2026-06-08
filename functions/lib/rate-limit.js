// IP-based rate limit（Cloudflare KV）
// 用於匿名投稿；登入用戶走 DB 端 increment_contribution_quota RPC
//
// 上限可由環境變數覆寫（fallback 為下方預設）：
//   RATE_LIMIT_VTUBER_ANON_HOUR (default 3)
//   RATE_LIMIT_VTUBER_ANON_DAY  (default 10)
//   RATE_LIMIT_VTUBER_USER_DAY  (default 20)
//   RATE_LIMIT_EVENT_ANON_HOUR  (default 1)
//   RATE_LIMIT_EVENT_ANON_DAY   (default 2)
//   RATE_LIMIT_EVENT_USER_DAY   (default 5)
//
// Key 格式：contrib:<type>:<scope>:<ip>:<bucket>

const DEFAULTS = {
    vtuber: { anon: { hour: 3, day: 10 }, user: { day: 20 } },
    event: { anon: { hour: 1, day: 2 }, user: { day: 5 } },
};

function parsePositiveInt(raw, fallback) {
    const n = parseInt(raw || '', 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * 從 env 讀出當前 rate limit 配置（fallback 為內建預設值）
 * @param {Object} env
 * @returns {{ vtuber: { anon: {hour, day}, user: {day} }, event: {...} }}
 */
export function getRateLimits(env) {
    return {
        vtuber: {
            anon: {
                hour: parsePositiveInt(env?.RATE_LIMIT_VTUBER_ANON_HOUR, DEFAULTS.vtuber.anon.hour),
                day: parsePositiveInt(env?.RATE_LIMIT_VTUBER_ANON_DAY, DEFAULTS.vtuber.anon.day),
            },
            user: {
                day: parsePositiveInt(env?.RATE_LIMIT_VTUBER_USER_DAY, DEFAULTS.vtuber.user.day),
            },
        },
        event: {
            anon: {
                hour: parsePositiveInt(env?.RATE_LIMIT_EVENT_ANON_HOUR, DEFAULTS.event.anon.hour),
                day: parsePositiveInt(env?.RATE_LIMIT_EVENT_ANON_DAY, DEFAULTS.event.anon.day),
            },
            user: {
                day: parsePositiveInt(env?.RATE_LIMIT_EVENT_USER_DAY, DEFAULTS.event.user.day),
            },
        },
    };
}

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
 * @param {{ hour: number, day: number }} limits - 從 getRateLimits() 取出對應 anon 區段
 * @returns {Promise<{ allowed: boolean, reason?: string, current: { hour, day }, limit: { hour, day } }>}
 */
export async function checkAndIncrementAnonQuota(kv, ip, type, limits) {
    if (!ip) {
        return { allowed: false, reason: 'no_ip', current: { hour: 0, day: 0 }, limit: limits };
    }
    const { hour: hourBucket, day: dayBucket } = nowBuckets();
    const hourKey = `contrib:${type}:hour:${ip}:${hourBucket}`;
    const dayKey = `contrib:${type}:day:${ip}:${dayBucket}`;

    const [hourRaw, dayRaw] = await Promise.all([kv.get(hourKey), kv.get(dayKey)]);
    const hourCount = parseInt(hourRaw || '0', 10);
    const dayCount = parseInt(dayRaw || '0', 10);

    if (hourCount >= limits.hour) {
        return { allowed: false, reason: 'hour_limit', current: { hour: hourCount, day: dayCount }, limit: limits };
    }
    if (dayCount >= limits.day) {
        return { allowed: false, reason: 'day_limit', current: { hour: hourCount, day: dayCount }, limit: limits };
    }

    await Promise.all([
        kv.put(hourKey, String(hourCount + 1), { expirationTtl: 3700 }),
        kv.put(dayKey, String(dayCount + 1), { expirationTtl: 90000 }),
    ]);

    return { allowed: true, current: { hour: hourCount + 1, day: dayCount + 1 }, limit: limits };
}

/**
 * 取訪客 IP（Cloudflare 自動帶 CF-Connecting-IP）
 */
export function getVisitorIp(request) {
    return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || '';
}

/**
 * 檢查 IP 是否在 banlist（env.BANNED_IPS 逗號分隔）
 */
export function isIpBanned(env, ip) {
    if (!ip || !env.BANNED_IPS) return false;
    return env.BANNED_IPS.split(',').map(s => s.trim()).filter(Boolean).includes(ip);
}
