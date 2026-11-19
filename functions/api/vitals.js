// Cloudflare Pages Function：匿名 Web Vitals 回報（src/utils/webVitals.ts 以 sendBeacon 送來）。
//
// GA4 的 web_vitals 只收得到同意 Cookie 的訪客；這裡收全體訪客「不良」的 CLS／INP 是哪個元素、哪一頁。
// 只存指標與頁面資訊：不存 IP、UA 或任何識別碼（IP 只加鹽雜湊後當限流鍵，不入庫）。
// 表：web_vitals_reports（migration 20261119090000；RLS 開、無 policy，只有 service_role 能寫）。

import { jsonResponse, readJsonBody, isRequestFromAllowedSite } from '../lib/cors.js';
import { getVisitorIp, hashIp, checkKvQuota, quotaWindow } from '../lib/rate-limit.js';
import { insert } from '../lib/supabase-server.js';

const MAX_BODY_BYTES = 2 * 1024;
const HOURLY_LIMIT = 30;

const isPath = (s) => typeof s === 'string' && s.startsWith('/') && s.length <= 120;
const isSize = (n) => Number.isFinite(n) && n >= 0 && n <= 20000;

/** 合法回傳要寫入的列，不合法回 null */
function toRow(b) {
    if (!b || typeof b !== 'object') return null;
    if (b.name !== 'CLS' && b.name !== 'INP') return null;
    if (typeof b.value !== 'number' || !Number.isFinite(b.value) || b.value < 0) return null;
    if (b.rating !== 'needs-improvement' && b.rating !== 'poor') return null;
    if (b.device !== 'mobile' && b.device !== 'desktop') return null;
    if (typeof b.target !== 'string' || b.target.length > 100) return null;
    if (!isPath(b.landing_path) || !isPath(b.page_path) || !isSize(b.vw) || !isSize(b.vh)) return null;
    return {
        metric: b.name, value: b.value, rating: b.rating, target: b.target,
        landing_path: b.landing_path, page_path: b.page_path, device: b.device,
        vw: Math.round(b.vw), vh: Math.round(b.vh),
    };
}

export async function onRequestPost({ request, env }) {
    if (!isRequestFromAllowedSite(request)) return jsonResponse({ ok: false, error: 'forbidden' }, 403, request);

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    const row = toRow(parsed.body);
    if (!row) return jsonResponse({ ok: false, error: 'invalid' }, 400, request);

    const key = `vitals:${await hashIp(env, getVisitorIp(request))}:${quotaWindow().hour}`;
    if (!(await checkKvQuota(env.RATE_LIMIT_KV, key, HOURLY_LIMIT, 3700))) {
        return jsonResponse({ ok: false, error: 'rate_limited' }, 429, request);
    }

    // sendBeacon 不看回應也不重試：寫入失敗（例如 migration 還沒套）照樣回 204
    await insert(env, 'web_vitals_reports', row);
    return new Response(null, { status: 204 });
}
