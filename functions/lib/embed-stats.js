// 嵌入小工具的「誰在用」統計：只記「哪個網站（Referer 主機）嵌了哪一份週表」，不記 IP、不記使用者。
//
// 寫入走 service_role RPC embed_referrer_seen（migration embed_referrers）；anon 讀不到明細表，只能讀彙總表 embed_usage。
// 嵌入頁本身沒有 edge 快取（只有瀏覽器 max-age），所以每個請求都會進到這裡；真正擋重複寫入的是：
//   同一 (kind, slug, host) 以 edge Cache API 去重 1 小時；RPC 回「已滿」（該份週表已達 200 站）時再記一個已滿旗標 1 小時，
//   期間換任何 host 都不再呼叫 RPC（Referer 可偽造，不讓人用假主機名放大資料庫寫入）。任何失敗都靜默。
import { rpc } from './supabase-server.js';

export const REFERRER_DEDUPE_TTL_S = 3600;
const CACHE_ORIGIN = 'https://multistreaming.org/__edge-cache/embed-referrer/v1/';
/** 本站與本專案的預覽站（產生器預覽、next）不算嵌入；其他人的 *.pages.dev 粉絲站要算（functions/lib/cors.js：專案名拼作 mutli-stream） */
const SELF_HOST_RE = /^(?:(?:.+\.)?multistreaming\.org|(?:.+\.)?mutli-stream\.pages\.dev|localhost|127\.0\.0\.1)$/;
/** 至少兩段的主機名；純 IPv4（含內網位址）不算網站 */
const HOSTNAME_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** 從 Referer 取出宿主站主機名；不是 http(s)、不像主機名、或是本站 → null */
export function refererHost(request) {
    const ref = request.headers.get('referer') || request.headers.get('referrer');
    if (!ref) return null;
    let u;
    try {
        u = new URL(ref);
    } catch {
        return null;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase();
    if (!HOSTNAME_RE.test(host) || IPV4_RE.test(host)) return null;
    if (SELF_HOST_RE.test(host)) return null;
    return host;
}

/**
 * 記一筆嵌入來源。回 true＝這次真的呼叫了 RPC。
 * cache 傳 null（測試或 *.pages.dev 沒有 Cache API）時每次都寫。
 */
export async function recordReferrer({ request, env, kind, slug, cache = globalThis.caches?.default ?? null, rpcFn = rpc, now = Date.now() }) {
    try {
        const host = refererHost(request);
        if (!host) return false;
        const key = new Request(`${CACHE_ORIGIN}${encodeURIComponent(kind)}/${encodeURIComponent(slug)}/${host}`);
        const fullKey = new Request(`${CACHE_ORIGIN}full/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`);
        if (cache) {
            const [hit, full] = await Promise.all([cache.match(key).catch(() => null), cache.match(fullKey).catch(() => null)]);
            if (hit || full) return false;
        }
        const res = await rpcFn(env, 'embed_referrer_seen', { p_kind: kind, p_slug: slug, p_host: host });
        if (!res || !res.ok) return false;
        if (res.data === false) {
            // RPC 拒絕（已達 200 站或參數不合）：1 小時內這份週表不再打資料庫
            if (cache) await cache.put(fullKey, new Response('full', { headers: { 'Cache-Control': `public, max-age=${REFERRER_DEDUPE_TTL_S}` } })).catch(() => {});
            return false;
        }
        if (cache) {
            await cache
                .put(key, new Response(String(now), { headers: { 'Cache-Control': `public, max-age=${REFERRER_DEDUPE_TTL_S}` } }))
                .catch(() => {});
        }
        return true;
    } catch {
        return false;
    }
}
