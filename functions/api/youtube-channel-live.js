// Cloudflare Pages Function：舊版 YouTube 直播偵測（整頁掃描）——已停用，一律回 410 Gone。
//
// 2026-10-04：前端已不再呼叫這支（直播偵測只走 /api/youtube-channel-live-og 的串流解析）。
// 舊版把約 1.6MB 的頻道頁整頁讀進來掃描，每次必定超過免費方案 10ms CPU；留著只是一個可被直接
// curl 耗資源的入口。部署前已載入的舊版前端在網路錯誤時仍可能打到這裡：收到非 2xx 會當成「沒開台」，安全。
// 觀察一兩週沒有流量後，連同 tests/functions/legacyLiveOrigin.test.ts 一起刪除。

const GONE_BODY = JSON.stringify({ error: 'Gone', message: 'Use /api/youtube-channel-live-og' });

export async function onRequestGet() {
    return new Response(GONE_BODY, {
        status: 410,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
    });
}

export async function onRequestOptions() {
    return new Response(null, { status: 204 });
}
