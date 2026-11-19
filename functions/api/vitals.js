// Cloudflare Pages Function：匿名 Web Vitals 回報（src/utils/webVitals.ts 以 sendBeacon 送來）。
//
// GA4 的 web_vitals 只收得到同意 Cookie 的訪客；這裡收全體訪客「不良」的 CLS／INP 是哪個元素、哪一頁。
// 只存指標與頁面資訊：完全不碰 IP、UA 或任何識別碼。
// 不做每 IP 限流：KV 免費方案每日只有 1,000 次寫入，每筆回報計數一次會拖垮其他靠 KV 的限流；
// 灌爆的防線是資料表的每小時總量上限（migration 20261119090000 的 trigger，超過就靜默丟棄）。
// 表：web_vitals_reports（RLS 開、無 policy，只有 service_role 能寫）。

import { jsonResponse, readJsonBody, isRequestFromAllowedSite } from '../lib/cors.js';
import { insert } from '../lib/supabase-server.js';
import { logError } from '../lib/logger.js';

const MAX_BODY_BYTES = 2 * 1024;

// Postgres text 存不了 NUL、JSON 也送不了單獨的 surrogate：放行會變成每筆都寫入失敗
const storable = (s) => typeof s === 'string' && !/[\u0000\ud800-\udfff]/.test(s);
const isPath = (s) => storable(s) && s.startsWith('/') && s.length <= 120;
// 寫入失敗的紀錄每個 isolate 只記一次：migration 沒套時每筆回報都會失敗，不能每筆都寫一列 system_logs
let insertFailureLogged = false;
const isSize = (n) => Number.isFinite(n) && n >= 0 && n <= 20000;

/** 合法回傳要寫入的列，不合法回 null */
function toRow(b) {
    if (!b || typeof b !== 'object') return null;
    if (b.name !== 'CLS' && b.name !== 'INP') return null;
    if (typeof b.value !== 'number' || !Number.isFinite(b.value) || b.value < 0) return null;
    if (b.rating !== 'needs-improvement' && b.rating !== 'poor') return null;
    if (b.device !== 'mobile' && b.device !== 'desktop') return null;
    if (!storable(b.target) || b.target.length > 100) return null;
    if (!isPath(b.landing_path) || !isPath(b.page_path) || !isSize(b.vw) || !isSize(b.vh)) return null;
    return {
        metric: b.name, value: b.value, rating: b.rating, target: b.target,
        landing_path: b.landing_path, page_path: b.page_path, device: b.device,
        vw: Math.round(b.vw), vh: Math.round(b.vh),
    };
}

export async function onRequestPost(context) {
    const { request, env } = context;
    if (!isRequestFromAllowedSite(request)) return jsonResponse({ ok: false, error: 'forbidden' }, 403, request);

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    const row = toRow(parsed.body);
    if (!row) return jsonResponse({ ok: false, error: 'invalid' }, 400, request);

    // sendBeacon 不看回應也不重試：寫入失敗（例如 migration 還沒套）照樣回 204，但要留紀錄，否則資料默默是空的
    const res = await insert(env, 'web_vitals_reports', row);
    if (!res.ok && !insertFailureLogged) {
        insertFailureLogged = true;
        const p = logError(env, 'vitals', 'web_vitals_reports insert failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        if (context.waitUntil) context.waitUntil(p);
        else p.catch(() => {});
    }
    return new Response(null, { status: 204 });
}
