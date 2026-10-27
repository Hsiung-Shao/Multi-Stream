// GET /api/songs/catalog — 歌曲播放清單的公開目錄（全部已發布歌回，一次回傳）
//
// 回應（短 key，見 migration get_song_catalog）：
//   [{ v: videoId, t: 標題, d: 開台時間, vt: {i, n, img} | null, s: [[code, start, end, 歌名, 原唱|null, song_id, 版本備註|null, ...], ...] }, ..., { songs: [...] }]
//   v2 起片段多帶歌曲本體欄位、陣列尾端多一筆歌曲字典；快取鍵升版避免舊格式被當新格式回傳。
//
// 快取（任何人都能打，必須擋住放大到 DB 的流量）：
//   1. edge Cache API 600 秒（只在自訂網域生效）
//   2. 同一個 isolate 內的記憶體快取 600 秒＋同時進來的請求共用同一次查詢
// 失敗（DB 逾時／錯誤）回 502 且不快取；日誌一律走 waitUntil，不擋主流程。
// 瀏覽器端 max-age=60（新發布的歌回最慢約 10 分鐘出現在目錄）。

import { handleOptions, getCorsHeaders } from '../../lib/cors.js';
import { rpc } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';
import { CATALOG_CACHE_KEY } from '../../lib/song-catalog-cache.js';

const CATALOG_TTL_SECONDS = 600;
const DB_TIMEOUT_MS = 5000;
/** 進行中的共用查詢超過這麼久就視為失效、重新建立 */
const INFLIGHT_STALE_MS = 15000;

let memo = null; // { at: number, text: string }
let inflight = null; // { at: number, promise: Promise<string|null> }

/** 測試用：清掉記憶體快取 */
export function resetSongCatalogMemo() {
    memo = null;
    inflight = null;
}

function getCache() {
    return typeof caches !== 'undefined' ? caches.default : null;
}

function reply(request, text, source) {
    return new Response(text, {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(request),
            'Cache-Control': 'public, max-age=60',
            'X-Edge-Cache': source,
        },
    });
}

function fail(request) {
    return new Response(JSON.stringify({ ok: false, error: 'catalog_unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(request), 'Cache-Control': 'no-store' },
    });
}

async function loadCatalog(context) {
    const { env } = context;
    // rpc() 不支援 AbortSignal,用 race 設逾時:卡住的查詢不能拖住請求
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, status: 504, data: null, error: 'timeout' }), DB_TIMEOUT_MS);
    });
    const res = await Promise.race([rpc(env, 'get_song_catalog'), timeout]).finally(() => clearTimeout(timer));
    if (!res.ok || !Array.isArray(res.data)) {
        const p = logError(env, 'songs-catalog', 'get_song_catalog failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 300) },
        });
        // 記 log 失敗不影響回應（logError 本身已盡力而為），忽略即可
        if (context.waitUntil) context.waitUntil(p); else p.catch(() => {});
        return null;
    }
    return JSON.stringify(res.data);
}

export async function onRequestGet(context) {
    const { request } = context;
    const cache = getCache();
    const key = new Request(CATALOG_CACHE_KEY);

    if (cache) {
        const hit = await cache.match(key).catch(() => null);
        if (hit) return reply(request, hit.body, 'HIT');
    }

    const now = Date.now();
    if (memo && now - memo.at < CATALOG_TTL_SECONDS * 1000) return reply(request, memo.text, 'MEMO');

    let source = 'MISS';
    if (inflight && now - inflight.at < INFLIGHT_STALE_MS) {
        source = 'SHARED';
    } else {
        const entry = { at: now, promise: null };
        entry.promise = loadCatalog(context)
            .then((text) => {
                // 已被視為失效、晚完成的舊查詢不能覆蓋較新的結果
                if (text !== null && inflight === entry) {
                    memo = { at: now, text };
                    if (cache) {
                        context.waitUntil?.(
                            cache
                                .put(key, new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CATALOG_TTL_SECONDS}` } }))
                                // edge 快取寫入失敗只會讓下次多查一次 DB，不影響本次回應
                                .catch(() => {}),
                        );
                    }
                }
                return text;
            })
            .catch(() => null)
            .finally(() => { if (inflight === entry) inflight = null; });
        inflight = entry;
        context.waitUntil?.(entry.promise);
    }

    const text = await inflight.promise;
    if (text === null) return fail(request);
    return reply(request, text, cache ? source : `${source}-NOCACHE`);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
