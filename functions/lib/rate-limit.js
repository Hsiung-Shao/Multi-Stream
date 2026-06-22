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
