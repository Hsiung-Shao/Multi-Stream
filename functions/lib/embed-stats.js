// 嵌入小工具的「誰在用」統計：只記「哪個網站（Referer 主機）嵌了哪一份週表」，不記 IP、不記使用者。
//
// 寫入走 service_role RPC embed_referrer_seen（migration embed_referrers）；anon 讀不到表，只能讀 view embed_usage。
// 同一 (kind, slug, host) 以 edge Cache API 去重 1 小時：嵌入頁每 5 分鐘快取過期後的回源才會進到這裡，
// 再加去重，單一宿主站每小時最多寫 1 次。任何失敗都靜默（統計不能影響嵌入本身）。
import { rpc } from './supabase-server.js';

export const REFERRER_DEDUPE_TTL_S = 3600;
const CACHE_ORIGIN = 'https://multistreaming.org/__edge-cache/embed-referrer/v1/';
/** 本站與預覽站：自己的頁面（產生器預覽）不算嵌入 */
const SELF_HOST_RE = /^(?:(?:.+\.)?multistreaming\.org|.+\.pages\.dev|localhost|127\.0\.0\.1)$/;
const HOSTNAME_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

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
    if (!HOSTNAME_RE.test(host)) return null;
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
        if (cache) {
            const hit = await cache.match(key).catch(() => null);
            if (hit) return false;
        }
        const res = await rpcFn(env, 'embed_referrer_seen', { p_kind: kind, p_slug: slug, p_host: host });
        if (!res || !res.ok) return false;
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
