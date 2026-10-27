// 歌曲目錄（GET /api/songs/catalog）的 edge 快取鍵與清除；社群投稿成功、後台還原後都要清，目錄才不必等 TTL 過期

/** catalog v2 的 edge 快取鍵；格式升版時 catalog.js 與這裡同步改 */
export const CATALOG_CACHE_KEY = 'https://songs.invalid/catalog/v2';

/**
 * 刪掉本機房的目錄快取（其他機房與 isolate 記憶體最慢約 10 分鐘後同步）。
 * 沒有 caches（本機開發）略過；刪除失敗只會讓目錄晚點更新，不影響呼叫端的結果，所以吞掉。
 * 有 waitUntil 就交給它，不拖慢回應。
 * @param {{ waitUntil?: (p: Promise<unknown>) => void }} context
 */
export function purgeCatalogCache(context) {
    if (typeof caches === 'undefined') return;
    const p = Promise.resolve()
        .then(() => caches.default.delete(new Request(CATALOG_CACHE_KEY)))
        .catch(() => {});
    if (context.waitUntil) context.waitUntil(p);
}
