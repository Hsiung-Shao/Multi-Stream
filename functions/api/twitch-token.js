// Cloudflare Pages Function：給前端 Twitch app access token（client secret 只留在伺服器）
//
// 環境變數：TWITCH_CLIENT_ID、TWITCH_CLIENT_SECRET（Secrets）；RATE_LIMIT_KV（權杖快取＋限流）
//
// 2026-11-27 資安稽核 C 組：
//   - 權杖共用 lib/twitch-token.js 的 KV 快取，不再每次請求都向 Twitch 換一張新的
//     （Twitch app 權杖的呼叫額度以 app 為單位，全站共用一張不會讓額度變少）
//   - 只接受本站頁面發出的請求＋每 IP 每小時 30 次；錯誤不回傳上游細節
// 這張 app 權杖只能讀公開資料，交給瀏覽器沒有實質損害；要給「能寫入／代表使用者」的權杖時必須改成伺服器代打。

import { jsonResponse, handleOptions, isRequestFromAllowedSite } from '../lib/cors.js';
import { getTwitchAppToken } from '../lib/twitch-token.js';
import { checkQuotas, getVisitorIp, ipKey, quotaWindow } from '../lib/rate-limit.js';

const HOURLY_LIMIT_PER_IP = 30;
// KV 快取的權杖在剩約 1 小時前就會換新，所以拿到的權杖至少還能用 1 小時
const CLIENT_EXPIRES_IN = 3600;

async function handleTokenRequest({ request, env }) {
  if (!isRequestFromAllowedSite(request)) {
    return jsonResponse({ error: 'forbidden' }, 403, request);
  }
  if (!env?.TWITCH_CLIENT_ID || !env?.TWITCH_CLIENT_SECRET) {
    return jsonResponse({ error: 'unavailable' }, 503, request);
  }

  const ip = getVisitorIp(request);
  if (ip) {
    const quota = await checkQuotas(env.RATE_LIMIT_KV, [
      { key: `twitch-token:${ipKey(ip)}:${quotaWindow().hour}`, limit: HOURLY_LIMIT_PER_IP, ttl: 3700 },
    ]);
    if (!quota.ok) return jsonResponse({ error: 'rate_limited' }, 429, request);
  }

  try {
    const accessToken = await getTwitchAppToken(env);
    return jsonResponse(
      { access_token: accessToken, expires_in: CLIENT_EXPIRES_IN, token_type: 'bearer' },
      200,
      request,
      { 'Cache-Control': 'private, max-age=3000' },
    );
  } catch {
    return jsonResponse({ error: 'upstream_failed' }, 502, request);
  }
}

export const onRequestGet = (context) => handleTokenRequest(context);
export const onRequestPost = (context) => handleTokenRequest(context);
export const onRequestOptions = (context) => handleOptions(context.request);
