// YouTube 直播偵測（OG Image 法）— 不使用 YouTube Data API、不耗 quota
//
// 核心抽自 functions/api/youtube-channel-live-og.js，給該 endpoint 與
// cron sync-livestreams 共用同一套偵測邏輯（單一事實來源）。
//
// 原理：
//   1. 用 social bot UA 抓 /channel/{id}/live HTML（讓 YouTube 回靜態 meta tags）
//   2. 從 og:image / canonical / og:url / _live.jpg 四來源 waterfall 抽 videoId
//   3. 對 i.ytimg.com/vi/{videoId}/hqdefault_live.jpg 發 HEAD —— 此 _live.jpg
//      只有「正在直播」時才存在，回 200 即確認 LIVE
//   4. HTML 解析 UPCOMING 標記，排程直播不當 LIVE（Fail-Closed）

const FETCH_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
}

// social bot UA 鼓勵 YouTube 回靜態 meta tags（og:image 等）
const SOCIAL_BOT_HEADERS = {
    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+917;',
};

const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// videoId 四來源 waterfall（對齊 youtube-channel-live-og.js）
function extractVideoId(html) {
    // 1) og:image / twitter:image / image → /vi/ID/
    const metaOg =
        html.match(/<meta\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']\s+content=["'](.*?)["']/i) ||
        html.match(/<meta\s+content=["'](.*?)["']\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']/i);
    if (metaOg) {
        const m = metaOg[1].match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
        if (m) return { videoId: m[1], source: 'meta-image' };
    }
    // 2) canonical link → /watch?v=ID（對 /live redirect 很可靠）
    const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/i);
    if (canonical) {
        const m = canonical[1].match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
        if (m) return { videoId: m[1], source: 'canonical-link' };
    }
    // 3) og:url
    const ogUrl = html.match(/<meta\s+property=["']og:url["']\s+content=["'](.*?)["']/i);
    if (ogUrl && ogUrl[1].includes('watch?v=')) {
        const m = ogUrl[1].match(/v=([a-zA-Z0-9_-]{11})/);
        if (m) return { videoId: m[1], source: 'og-url' };
    }
    // 4) brute force 任何 _live.jpg
    const liveImg = html.match(/https:\/\/i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]{11})\/(?:maxres|hq)default_live\.jpg/);
    if (liveImg) return { videoId: liveImg[1], source: 'brute-force-regex' };

    return { videoId: null, source: null };
}

// 直播標題（og.js 不需要，但 cron 寫 vtuber_livestreams.title 要）
function extractTitle(html) {
    const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (og) return og[1].slice(0, 200);
    const t = html.match(/<title>(.*?)<\/title>/);
    if (t && t[1] && !/^YouTube$/i.test(t[1].trim())) return t[1].replace(/\s*-\s*YouTube\s*$/i, '').slice(0, 200);
    const j = html.match(/"title":"((?:[^"\\]|\\.)+)"/);
    if (j) { try { return JSON.parse(`"${j[1]}"`).slice(0, 200); } catch { return j[1].slice(0, 200); } }
    return null;
}

/**
 * 偵測單一 YouTube channel 直播狀態
 * @param {string} channelId - UC... format
 * @returns {Promise<{
 *   isLive: boolean, isUpcoming: boolean, videoId: string|null,
 *   video_url: string|null, thumbnail_url: string|null,
 *   title: string|null, scheduledStartTime: string|null,
 *   extractionSource: string|null
 * }>}
 */
export async function detectYouTubeLiveOg(channelId) {
    const offline = {
        isLive: false, isUpcoming: false, videoId: null,
        video_url: null, thumbnail_url: null, title: null,
        scheduledStartTime: null, extractionSource: null,
    };
    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) return offline;

    const fetchUrl = `https://www.youtube.com/channel/${channelId}/live?ucbcb=1&hl=en&gl=US`;
    try {
        const htmlResp = await withTimeout(
            fetch(fetchUrl, { method: 'GET', headers: SOCIAL_BOT_HEADERS, redirect: 'follow' }),
            FETCH_TIMEOUT_MS,
        );
        if (!htmlResp.ok) return offline;
        const html = await withTimeout(htmlResp.text(), FETCH_TIMEOUT_MS);

        const { videoId, source } = extractVideoId(html);
        if (!videoId) return offline;

        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // UPCOMING 優先：即使 _live.jpg 存在（排程也會生縮圖），HTML 標記排程則不當 LIVE
        const isUpcoming =
            html.includes('"status":"UPCOMING"') ||
            html.includes('"isUpcoming":true') ||
            /"scheduledStartTime"\s*:\s*"\d+"/.test(html);
        const startMatch = html.match(/"scheduledStartTime"\s*:\s*"(\d+)"/);

        if (isUpcoming) {
            return {
                isLive: false, isUpcoming: true, videoId,
                video_url: watchUrl,
                thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                title: extractTitle(html),
                scheduledStartTime: startMatch ? startMatch[1] : null,
                extractionSource: source,
            };
        }

        // 對 _live.jpg 發 HEAD：只有正在直播才存在 → 200 確認 LIVE
        let isConfirmedLive = false;
        try {
            const imgResp = await withTimeout(
                fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg`, {
                    method: 'HEAD', headers: { 'User-Agent': BROWSER_UA },
                }),
                FETCH_TIMEOUT_MS,
            );
            isConfirmedLive = imgResp.status === 200;
        } catch { /* 視同非直播 */ }

        return {
            isLive: isConfirmedLive,
            isUpcoming: false,
            videoId,
            video_url: watchUrl,
            thumbnail_url: isConfirmedLive
                ? `https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg`
                : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            title: extractTitle(html),
            scheduledStartTime: null,
            extractionSource: source,
        };
    } catch {
        return offline;
    }
}

/**
 * 並行偵測多個 channel，只回正在直播的（給 cron sync-livestreams 用）
 * 回傳格式對齊舊版 detectYouTubeLiveBatch，sync-livestreams 改動最小。
 * @returns {Promise<Map<string, { videoId, title, video_url, thumbnail_url }>>}
 */
export async function detectYouTubeLiveOgBatch(channelIds, concurrency = 5) {
    const result = new Map();
    let index = 0;

    async function worker() {
        while (index < channelIds.length) {
            const i = index++;
            const channelId = channelIds[i];
            const r = await detectYouTubeLiveOg(channelId);
            if (r.isLive && r.videoId) {
                result.set(channelId, {
                    videoId: r.videoId,
                    title: r.title,
                    video_url: r.video_url,
                    thumbnail_url: r.thumbnail_url,
                });
            }
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, channelIds.length) }, () => worker());
    await Promise.all(workers);
    return result;
}
