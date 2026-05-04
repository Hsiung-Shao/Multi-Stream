// YouTube 直播偵測 helper（給 cron sync-livestreams 用）
//
// 簡化版：從 youtube-channel-live.js 抽出最關鍵的偵測邏輯，不做完整 watch 驗證
// 透過 /channel/{id}/live 的 redirect 行為偵測：
//   - 開台：redirect 到 /watch?v=<videoId>
//   - 未開台：return /channel/{id} 的 channel 首頁（HTML 不含 watch redirect）
//
// 與 youtube-channel-live.js 完整版差別：
//   - 不做 watch HTML 二次驗證（速度優先）
//   - 不偵測 UPCOMING / 排程直播
//   - 假陽性可能（極少見：頻道首頁恰好有 live 標記但不是當下 live）— cron 90 秒會自校正

const FETCH_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
}

const baseHeaders = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Cache-Control': 'no-store',
    'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+917;',
};

function extractVideoIdFromHtml(html) {
    // /live HTML 內若有正在直播的 videoId，會出現在 ytInitialPlayerResponse / videoDetails
    const m1 = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (!m1) return null;

    // 確認是 live 而非排程或結束 — 看 isLive 標記
    const isLive =
        /"isLiveNow":true/.test(html) ||
        /"isLive":true[^}]*"isUpcoming":false/.test(html) ||
        /"playabilityStatus":\{"status":"LIVE_STREAM"/.test(html);

    return isLive ? m1[1] : null;
}

function extractTitleFromHtml(html) {
    const m = html.match(/<meta name="title" content="([^"]+)"/);
    if (m) return m[1].slice(0, 200);
    const m2 = html.match(/"title":"((?:[^"\\]|\\.)+)"/);
    if (m2) {
        try { return JSON.parse(`"${m2[1]}"`).slice(0, 200); } catch { return m2[1].slice(0, 200); }
    }
    return null;
}

/**
 * 偵測單一 YouTube channel 是否正在直播
 * @param {string} channelId - UC... format
 * @returns {Promise<null | { videoId, title, video_url, thumbnail_url }>}
 *   null 表示沒在直播；object 表示有直播
 */
export async function detectYouTubeLive(channelId) {
    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) return null;

    const url = `https://www.youtube.com/channel/${channelId}/live?hl=en&gl=US`;
    try {
        const res = await withTimeout(
            fetch(url, { headers: baseHeaders, redirect: 'follow' }),
            FETCH_TIMEOUT_MS,
        );
        if (!res.ok) return null;
        const html = await withTimeout(res.text(), FETCH_TIMEOUT_MS);

        const videoId = extractVideoIdFromHtml(html);
        if (!videoId) return null;

        return {
            videoId,
            title: extractTitleFromHtml(html),
            video_url: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpe`,
        };
    } catch {
        return null; // timeout / network error 視同沒在直播
    }
}

/**
 * 並行偵測多個 channel，限制併發數
 * @param {string[]} channelIds
 * @param {number} concurrency
 * @returns {Promise<Map<string, { videoId, title, video_url, thumbnail_url }>>}
 *   key 為 channelId
 */
export async function detectYouTubeLiveBatch(channelIds, concurrency = 5) {
    const result = new Map();
    let index = 0;

    async function worker() {
        while (index < channelIds.length) {
            const i = index++;
            const channelId = channelIds[i];
            const live = await detectYouTubeLive(channelId);
            if (live) result.set(channelId, live);
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, channelIds.length) }, () => worker());
    await Promise.all(workers);
    return result;
}
