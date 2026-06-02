// Twitch app access token（client_credentials）取得 + KV 快取
//
// token 有效期很長（約 60 天），不必每次 cron 都重拿。
// 用既有 RATE_LIMIT_KV 快取（key='twitch_app_token'，TTL = expires_in − 1h buffer）。
// KV 不存在 / 讀寫失敗時 graceful fallback：直接拿新 token（等同舊行為）。
//
// 給 sync-livestreams 與 snapshot-subscribers 共用單一 token 來源。

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const KV_KEY = 'twitch_app_token';
const TTL_BUFFER_SEC = 3600; // 提前 1h 過期，避免邊界用到剛失效的 token

async function fetchNewToken(env) {
    const params = new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
    });
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });
    if (!res.ok) throw new Error(`twitch token ${res.status}`);
    return res.json(); // { access_token, expires_in, ... }
}

/**
 * 取得 Twitch app token，優先用 KV 快取
 * @param {Object} env - 需 TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET；選 RATE_LIMIT_KV
 * @returns {Promise<string>} access_token
 */
export async function getTwitchAppToken(env) {
    const kv = env.RATE_LIMIT_KV;

    // 1. 查快取
    if (kv) {
        try {
            const cached = await kv.get(KV_KEY);
            if (cached) return cached;
        } catch { /* 讀失敗 → 往下拿新 token */ }
    }

    // 2. 拿新 token
    const data = await fetchNewToken(env);
    const token = data?.access_token;
    if (!token) throw new Error('twitch token: no access_token');

    // 3. 存快取（TTL 至少 60s）
    if (kv && data.expires_in) {
        try {
            const ttl = Math.max(60, data.expires_in - TTL_BUFFER_SEC);
            await kv.put(KV_KEY, token, { expirationTtl: ttl });
        } catch { /* 存失敗不影響本次回傳 */ }
    }

    return token;
}
