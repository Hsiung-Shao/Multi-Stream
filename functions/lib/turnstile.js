// Cloudflare Turnstile 伺服器端驗證（投稿 VTuber、資料回報共用）
//
// 環境變數：
//   TURNSTILE_SECRET_KEY  Secret（Pages 專案 → Variables and Secrets）
//   ENFORCE_TURNSTILE     只有明確設成 'false' 才跳過（本地開發）；沒設或其他值一律要驗證
// 要驗證卻沒設 secret → 回 503（設定漏掉要讓人看得到，不能默默放行）。
// token 只能驗一次、有效 300 秒；前端送出後（不論成敗）都要 reset widget 取新 token。

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 3000;
const MAX_TOKEN_LENGTH = 2048;

/**
 * @param {Object} env
 * @param {unknown} token - 前端 widget 給的 token
 * @param {string} [ip] - 訪客 IP（給 Cloudflare 參考）
 * @param {{ fetch?: typeof fetch }} [opts]
 * @returns {Promise<{ ok: true, skipped?: boolean } | { ok: false, status: 400|403|503, error: string }>}
 */
export async function verifyTurnstile(env, token, ip, opts = {}) {
    if (env?.ENFORCE_TURNSTILE === 'false') return { ok: true, skipped: true };
    if (!env.TURNSTILE_SECRET_KEY) return { ok: false, status: 503, error: 'turnstile_not_configured' };
    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) {
        return { ok: false, status: 400, error: 'turnstile_missing' };
    }

    const form = new URLSearchParams();
    form.append('secret', env.TURNSTILE_SECRET_KEY);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    try {
        const res = await (opts.fetch ?? fetch)(SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
            signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        return data?.success === true ? { ok: true } : { ok: false, status: 403, error: 'turnstile_failed' };
    } catch {
        // 逾時或網路錯誤：當成驗證失敗（不放行）
        return { ok: false, status: 403, error: 'turnstile_failed' };
    } finally {
        clearTimeout(timer);
    }
}
