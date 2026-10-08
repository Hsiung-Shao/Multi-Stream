// GET /api/schedule/snapshot — 週表 snapshot 的同源快取代理
//
// 為什麼要代理：snapshot 放在 Supabase Storage（us-east-1）。物件 metadata 雖然是 max-age=60
// （supabase/functions/_shared/db.ts 上傳時帶），公開網址實際回的卻是 `Cache-Control: no-cache`（2026-10-08 實測），
// Cloudflare 每次都回源 REVALIDATED，台灣使用者每次進週表頁都要跨太平洋，實測 1～3 秒。
// 改由本站 edge 快取，並讓 /schedule 的 HTML 預載這支（functions/[[path]].js），和 JS 同時下載。
//
// 快取（不 parse JSON、只搬 ArrayBuffer，Workers CPU 每請求 <1ms，回源那次約 2～3ms 解壓）：
//   1. 同 isolate 記憶體＋edge Cache API（Cache API 只在自訂網域生效；*.pages.dev 靠記憶體那層）
//   2. 60 秒內直接回；超過就回手上這份並在背景回源（waitUntil；同時進來的請求共用同一次回源）
//   3. 手上那份超過 30 分鐘（或完全沒有）才同步回源；失敗回 502，讓前端退回直連 Storage
//      （src/features/schedule/snapshotSource.ts）——不拿很舊的資料當 200 擋住前端的退回
//   4. 回源失敗後 30 秒內不再回源（源站故障時不讓每個請求都去撞）
//   回源逾時 4 秒，必須小於前端等代理的 6 秒（SNAPSHOT_PROXY_TIMEOUT_MS），否則前端會先放棄
// 同源請求，不帶 CORS 標頭（也避免 Vary: Origin 拆散快取）。
// snapshot 每 10 分鐘左右重產一次（schedule-light／live），60 秒新鮮度足夠。

export const SNAPSHOT_FRESH_MS = 60_000;
/** 手上那份最多舊到多久還拿來回（同時背景更新）；超過就同步回源，失敗回 502 */
export const SNAPSHOT_MAX_SERVE_MS = 30 * 60_000;
/** edge 快取保存時間（跨 isolate 共用；isolate 記憶體那份另外算） */
const EDGE_TTL_S = 600;
export const SNAPSHOT_ORIGIN_TIMEOUT_MS = 4000;
export const SNAPSHOT_FAIL_BACKOFF_MS = 30_000;
const OBJECT_PATH = '/storage/v1/object/public/streams/v1/snapshot.json';
const CACHE_KEY = 'https://multistreaming.org/__edge-cache/schedule-snapshot/v1';
const FETCHED_AT_HEADER = 'X-Snapshot-Fetched-At';

// 同一個 isolate 內的最新一份、進行中的回源、上次回源失敗的時間
let memo = null; // { at: number, body: ArrayBuffer }
let inflight = null; // Promise<{ at, body } | null>
let lastFailAt = 0;

/** 測試用：清掉 isolate 內的狀態 */
export function resetSnapshotProxy() {
    memo = null;
    inflight = null;
    lastFailAt = 0;
}

async function fromOrigin(env, fetchFn, now) {
    const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
    if (!base) throw new Error('SUPABASE_URL missing');
    const res = await fetchFn(base + OBJECT_PATH, { signal: AbortSignal.timeout(SNAPSHOT_ORIGIN_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`origin HTTP ${res.status}`);
    if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('origin not json');
    return { at: now, body: await res.arrayBuffer() };
}

/** 只有 edge 那份比手上的新才讀 body（先看標頭，避免每次都把 628KB 讀一遍） */
async function readEdgeIfNewer(cache, than) {
    const hit = await cache.match(CACHE_KEY).catch(() => null);
    if (!hit) return null;
    const at = Number(hit.headers.get(FETCHED_AT_HEADER));
    if (!Number.isFinite(at) || at <= than) {
        await hit.body?.cancel().catch(() => {});
        return null;
    }
    return { at, body: await hit.arrayBuffer() };
}

/** 回源（同 isolate 共用一次）；寫 edge 快取另外交給 waitUntil，不讓等待中的請求多等一次 put */
function refresh(env, cache, fetchFn, now, waitUntil) {
    if (!inflight) {
        inflight = fromOrigin(env, fetchFn, now)
            .then((entry) => {
                memo = entry;
                lastFailAt = 0;
                if (cache) {
                    const stored = new Response(entry.body.slice(0), {
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': `public, max-age=${EDGE_TTL_S}`,
                            [FETCHED_AT_HEADER]: String(entry.at),
                        },
                    });
                    waitUntil(cache.put(CACHE_KEY, stored).catch(() => {}));
                }
                return entry;
            })
            .catch(() => {
                lastFailAt = now;
                return null;
            })
            .finally(() => {
                inflight = null;
            });
    }
    // 每個用到這次回源的請求都延長它的生命週期：建立者斷線時，等待中的其他請求不會被一起取消
    waitUntil(inflight);
    return inflight;
}

function respond(entry, now, headOnly) {
    const age = Math.max(0, now - entry.at);
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        // 回的是舊份（背景正在更新）時不讓瀏覽器再快取，下次查詢就拿得到新的
        'Cache-Control': age < SNAPSHOT_FRESH_MS ? 'public, max-age=30' : 'no-cache',
        'X-Snapshot-Age': String(Math.round(age / 1000)),
        'X-Content-Type-Options': 'nosniff',
    };
    // 每次給一份複本：同一個 ArrayBuffer 會被多個回應共用，不能讓任何一個轉移（detach）掉它
    return new Response(headOnly ? null : entry.body.slice(0), { status: 200, headers });
}

function unavailable() {
    return new Response(JSON.stringify({ error: 'snapshot_unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
}

export async function onRequest(context, deps = {}) {
    const { env, request } = context;
    const method = request?.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
        return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'X-Content-Type-Options': 'nosniff' } });
    }
    const headOnly = method === 'HEAD';
    const fetchFn = deps.fetchFn ?? fetch;
    const cache = deps.cache !== undefined ? deps.cache : (globalThis.caches?.default ?? null);
    const now = deps.now ?? Date.now();
    const waitUntil = (p) => {
        if (typeof context.waitUntil === 'function') context.waitUntil(p);
    };

    let entry = memo;
    if ((!entry || now - entry.at >= SNAPSHOT_FRESH_MS) && cache) {
        const edge = await readEdgeIfNewer(cache, entry?.at ?? 0);
        if (edge) {
            entry = edge;
            memo = edge;
        }
    }

    const age = entry ? now - entry.at : Infinity;
    const backingOff = lastFailAt > 0 && now - lastFailAt < SNAPSHOT_FAIL_BACKOFF_MS;
    if (age < SNAPSHOT_FRESH_MS) return respond(entry, now, headOnly);
    if (age < SNAPSHOT_MAX_SERVE_MS) {
        if (!backingOff) refresh(env, cache, fetchFn, now, waitUntil);
        return respond(entry, now, headOnly);
    }
    if (backingOff) return unavailable();
    const fresh = await refresh(env, cache, fetchFn, now, waitUntil);
    return fresh ? respond(fresh, now, headOnly) : unavailable();
}
