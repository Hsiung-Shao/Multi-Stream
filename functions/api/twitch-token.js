// Cloudflare Pages Function：給前端 Twitch app access token（client secret 只留在伺服器）
//
// 環境變數：TWITCH_CLIENT_ID、TWITCH_CLIENT_SECRET（Secrets）
//
// 2026-11-27 資安稽核 C 組：
//   - 只接受本站頁面發出的請求；錯誤不回傳上游細節
//   - 給瀏覽器的權杖放 Cache API（edge，不吃 KV 每日 1,000 次寫入額度），同一機房 1 小時內共用一張，
//     不再每次請求都向 Twitch 換新的（Twitch app 權杖的呼叫額度以 app 為單位，共用不會讓額度變少）
//   - 與排程用的權杖（lib/twitch-token.js 的 KV 快取）分開：瀏覽器拿到的權杖可被任何人撤銷，不能拖累排程
//   - 前端遇到 401 會帶 X-Stale-Token 重取；它等於快取裡那張、且換發已超過 60 秒才換新的
//     （冷卻時間：任何人都能帶上目前的權杖，不能讓它變成「每次請求換一張」）
// 這張 app 權杖只能讀公開資料；要給「能寫入／代表使用者」的權杖時必須改成伺服器代打。
// Cache API 只在自訂網域生效，*.pages.dev 上是 no-op（每次請求都換新，只影響預覽站）。

import { jsonResponse, handleOptions, isRequestFromAllowedSite } from '../lib/cors.js';
import { fetchNewToken } from '../lib/twitch-token.js';

const CLIENT_TOKEN_TTL_SECONDS = 3600;
const REMINT_COOLDOWN_MS = 60 * 1000;
const CACHE_KEY = 'https://cache.internal/api/twitch-token/client-app-token';

async function handleTokenRequest(context) {
  const { request, env } = context;
  if (!isRequestFromAllowedSite(request)) {
    return jsonResponse({ error: 'forbidden' }, 403, request);
  }
  if (!env?.TWITCH_CLIENT_ID || !env?.TWITCH_CLIENT_SECRET) {
    return jsonResponse({ error: 'unavailable' }, 503, request);
  }

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const stale = request.headers.get('X-Stale-Token');
  let accessToken = null;
  if (cache) {
    const hit = await cache.match(CACHE_KEY);
    const cached = hit ? await hit.json().catch(() => null) : null;
    const coolingDown = Date.now() - (cached?.minted_at ?? 0) < REMINT_COOLDOWN_MS;
    if (cached?.access_token && (cached.access_token !== stale || coolingDown)) accessToken = cached.access_token;
  }

  if (!accessToken) {
    try {
      accessToken = (await fetchNewToken(env))?.access_token;
    } catch {
      accessToken = null;
    }
    if (!accessToken) return jsonResponse({ error: 'upstream_failed' }, 502, request);
    if (cache) {
      const stored = new Response(JSON.stringify({ access_token: accessToken, minted_at: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CLIENT_TOKEN_TTL_SECONDS}` },
      });
      const put = cache.put(CACHE_KEY, stored);
      if (context.waitUntil) context.waitUntil(put); else await put;
    }
  }

  // 權杖本身約 60 天有效；只讓前端用 1 小時，之後回來拿（可能已換新）
  return jsonResponse(
    { access_token: accessToken, expires_in: CLIENT_TOKEN_TTL_SECONDS, token_type: 'bearer' },
    200,
    request,
    { 'Cache-Control': 'no-store' },
  );
}

export const onRequestGet = (context) => handleTokenRequest(context);
export const onRequestPost = (context) => handleTokenRequest(context);
export const onRequestOptions = (context) => handleOptions(context.request);
