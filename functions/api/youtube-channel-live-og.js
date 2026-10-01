import { getCorsHeaders, isRequestFromAllowedSite } from '../lib/cors.js';
import { upsert } from '../lib/supabase-server.js';
import { readLiveOgPage, videoIdFromHead } from '../lib/live-og-page.js';

// ── Edge 快取 ──────────────────────────────────────────────────────────────
// 2026-09 CPU 超限事件：本端點單月 1.32M 次（全站 78%），每次抓約 1.6MB 的 YouTube 頁面再解析，
// 單次 CPU 8–11ms 貼著免費方案 10ms 上限，且原本完全不快取（快取命中率 0.92%）。
// 用 Cache API 讓同一頻道在 TTL 內只抓一次：多位使用者／多個分頁收藏同一頻道時，命中幾乎不耗 CPU。
// 2026-10-01 起未命中時也改成串流讀取、只解析需要的兩小段（functions/lib/live-og-page.js）。
// 代價：開播偵測最多延遲 CACHE_TTL_SECONDS。Cache API 只在自訂網域生效，*.pages.dev 上是 no-op。
const CACHE_TTL_SECONDS = 180;
// YouTube 抓取失敗（多半是被限流）也快取，但縮短：避免「查不到」被當成「沒開播」太久，同時不在限流時猛打
const FAILED_FETCH_CACHE_TTL_SECONDS = 60;
const FETCH_FAILED_HEADER = 'X-Live-Og-Fetch-Failed';
const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
// 排程在這之後的「即將直播」視為週表框（頻道擺一個很遠未來的排程直播放週表圖），不算真的要開播
const SCHEDULE_FRAME_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export async function onRequestGet(context) {
    const { request } = context;
    // 只接受本站頁面發出的請求（30 天有 26k 次 curl 直接打）。header 可偽造，真正的防線是 WAF rate limiting。
    if (!isRequestFromAllowedSite(request)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');
    // 格式不合的交給原邏輯回 400，不進快取（避免任意字串產生無限多個快取 key）
    if (!channelId || !CHANNEL_ID_RE.test(channelId)) {
        return toClientResponse(await detectLiveOg(context), 'SKIP', request);
    }

    const cache = typeof caches !== 'undefined' ? caches.default : null;
    // 正規化 key：只留 channelId，其他查詢參數（例如加亂數想繞過快取）一律忽略
    const cacheKey = new Request(`${url.origin}/api/youtube-channel-live-og?channelId=${channelId}`);

    if (cache) {
        const hit = await cache.match(cacheKey);
        if (hit) return toClientResponse(hit, 'HIT', request);
    }

    const response = await detectLiveOg(context);

    // 寫進共享表 youtube_live_status，讓其他使用者直接讀資料庫、不必再觸發本端點。
    // 抓取失敗不寫（只留在 edge 快取 60 秒），「查不到」不能當成全站共用的「沒開播」。
    if (response.status === 200 && !response.headers.get(FETCH_FAILED_HEADER)) {
        context.waitUntil(persistLiveStatus(context.env, channelId, response.clone()));
    }

    if (cache && response.status === 200) {
        const ttl = response.headers.get(FETCH_FAILED_HEADER) ? FAILED_FETCH_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS;
        const stored = new Response(response.clone().body, response);
        stored.headers.set('Cache-Control', `public, max-age=${ttl}`);
        context.waitUntil(cache.put(cacheKey, stored));
    }

    return toClientResponse(response, 'MISS', request);
}

// 回給瀏覽器的版本：維持原本的 no-store（快取只在 edge 層），並標示命中狀態方便觀察。
// CORS 改用白名單（原本是 '*'，任何網站都能在瀏覽器裡拿本站當免費的開播偵測 API）。
function toClientResponse(response, cacheStatus, request) {
    const out = new Response(response.body, response);
    out.headers.set('Cache-Control', 'no-store');
    out.headers.set('X-Edge-Cache', cacheStatus);
    out.headers.delete(FETCH_FAILED_HEADER);
    for (const [key, value] of Object.entries(getCorsHeaders(request, { methods: 'GET, OPTIONS' }))) {
        out.headers.set(key, value);
    }
    return out;
}

/**
 * 端點回應 → youtube_live_status 的一列。沒有實際抓到頻道資料（沒有 videoId 也沒有頻道名）就回 null：
 * YouTube 對不存在的頻道回 404（走 fetch-failed，不會進到這裡），這一關再擋掉格式正確但沒有內容的結果，
 * 避免有人用隨機 ID 灌表。
 */
export function toLiveStatusRow(channelId, data, now = Date.now()) {
    if (!data || typeof data !== 'object' || data.error) return null;
    const videoId = typeof data.videoId === 'string' && VIDEO_ID_RE.test(data.videoId) ? data.videoId : null;
    const channelTitle = typeof data.channelTitle === 'string' && data.channelTitle.trim()
        ? data.channelTitle.trim().slice(0, 200)
        : null;
    if (!videoId && !channelTitle) return null;

    // scheduledStartTime 是 epoch 秒字串；幾百年後的週表框也要能表示，超出 Date 範圍就當作沒有
    const startSec = Number(data.scheduledStartTime);
    const start = Number.isFinite(startSec) && startSec > 0 ? new Date(startSec * 1000) : null;
    const scheduledStartAt = start && !Number.isNaN(start.getTime()) ? start : null;

    const isUpcoming = data.isUpcoming === true;
    const isScheduleFrame = isUpcoming && scheduledStartAt !== null
        && scheduledStartAt.getTime() - now > SCHEDULE_FRAME_AFTER_MS;

    return {
        channel_id: channelId,
        is_live: data.isLive === true,
        is_upcoming: isUpcoming && !isScheduleFrame,
        is_schedule_frame: isScheduleFrame,
        video_id: videoId,
        channel_title: channelTitle,
        scheduled_start_at: scheduledStartAt ? scheduledStartAt.toISOString() : null,
        checked_at: new Date(now).toISOString(),
    };
}

// 寫庫失敗不影響回應（在 waitUntil 裡跑）；沒設 service_role 的環境（本機、preview）直接略過
async function persistLiveStatus(env, channelId, response) {
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return;
    try {
        const row = toLiveStatusRow(channelId, await response.json());
        if (!row) return;
        const res = await upsert(env, 'youtube_live_status', [row], { onConflict: 'channel_id' });
        if (!res.ok) console.warn('[live-og] 寫入 youtube_live_status 失敗', res.status);
    } catch {
        // 解析或網路錯誤：下一位使用者查詢時會再寫一次
    }
}

async function detectLiveOg(context) {
    const { request } = context;
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');

    // --- 1. Basic Validation ---
    if (!channelId) {
        return new Response(JSON.stringify({ error: '缺少 channelId 参数' }), {
            status: 400,
            headers: jsonHeaders()
        });
    }

    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
        return new Response(JSON.stringify({ error: '無效的 channelId 格式' }), {
            status: 400,
            headers: jsonHeaders()
        });
    }

    // --- 2. Fetch Channel Live URL HTML ---
    const liveUrl = `https://www.youtube.com/channel/${channelId}/live`;
    // Common params to reduce consent page probability
    const fetchUrl = new URL(liveUrl);
    fetchUrl.searchParams.set('ucbcb', '1');
    fetchUrl.searchParams.set('hl', 'en');
    fetchUrl.searchParams.set('gl', 'US');

    try {
        const htmlResp = await fetch(fetchUrl.toString(), {
            method: 'GET',
            headers: {
                // Use a Social Bot UA to encourage YouTube to serve static meta tags
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+917;'
            },
            redirect: 'follow'
        });

        if (!htmlResp.ok) {
            return new Response(JSON.stringify({
                isLive: false,
                message: `YouTube Page Fetch Failed: ${htmlResp.status}`,
                debug: { liveUrl, status: htmlResp.status }
            }), { status: 200, headers: { ...jsonHeaders(), [FETCH_FAILED_HEADER]: '1' } });
        }

        // 串流讀取：只讀頁面前 64KB 與 ytInitialPlayerResponse 區段，其餘取消下載（functions/lib/live-og-page.js）
        const page = await readLiveOgPage(htmlResp);

        // 順手解析「官方頻道名」供離線頻道資料庫蒐集用(零額外請求，HTML 已在手上）。
        // 在 videoId 瀑布前先取，確保所有 return 分支（含 offline / 找不到 videoId）都帶得出。
        const channelTitle = extractChannelTitle(page);

        // Debug: Try to find page title to see if we hit Consent page
        const titleMatch = page.head.match(/<title>(.*?)<\/title>/);
        const pageTitle = titleMatch ? titleMatch[1] : 'Unknown Title';

        // --- 3. Extract Video ID (Method Waterfall) ---
        // og:image → canonical → og:url，都在頁面前 5KB；watch 頁沒有 og:image，canonical 就是 watch 網址。
        // 原本的第 4 個來源（整頁找任意 _live.jpg）實測從未出現，而且會比對到推薦區塊的別支影片，已移除。
        const { videoId, source: extractionSource } = videoIdFromHead(page.head);

        if (!videoId) {
            return new Response(JSON.stringify({
                isLive: false,
                channelTitle,
                message: 'Video ID not found in HTML',
                debug: { liveUrl, pageTitle, snippet: page.head.substring(0, 1000) }
            }), { status: 200, headers: jsonHeaders() });
        }

        const verifyUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg`;

        // --- 4. UPCOMING markers（只看這支影片的 ytInitialPlayerResponse，推薦區塊的標記不算）---
        // 排程直播也會產生 _live.jpg 縮圖，所以待機判斷優先；判定為待機就不必再發 HEAD。
        const timeMatch = page.player.match(/"scheduledStartTime"\s*:\s*"(\d+)"/);
        const isUpcoming = page.player.includes('"status":"UPCOMING"')
            || page.player.includes('"isUpcoming":true')
            || !!timeMatch;
        const scheduledStartTime = timeMatch ? timeMatch[1] : null;

        if (isUpcoming) {
            return new Response(JSON.stringify({
                isLive: false,
                isUpcoming: true,
                videoId: videoId,
                channelTitle,
                scheduledVideoId: videoId,
                scheduledStartTime: scheduledStartTime,
                finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
                message: 'Upcoming stream detected via HTML parse',
                debug: {
                    extractionSource,
                    verifyUrl,
                    verifyStatus: null,
                    method: 'HTML_PARSE_UPCOMING',
                    liveUrl
                }
            }), { status: 200, headers: jsonHeaders() });
        }

        // --- 5. Verify with Image Server (HEAD Request) ---
        // _live.jpg 只有正在直播時才存在：200 ＝ 直播中
        const imgResp = await fetch(verifyUrl, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
            }
        });

        const isConfirmedLive = imgResp.status === 200;

        if (isConfirmedLive) {
            return new Response(JSON.stringify({
                isLive: true,
                videoId: videoId,
                channelTitle,
                finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
                message: 'Live confirmed via Image Server',
                debug: {
                    extractionSource,
                    verifyUrl,
                    verifyStatus: imgResp.status,
                    method: 'OG_IMAGE_PLUS_HEAD_CHECK',
                    liveUrl
                }
            }), { status: 200, headers: jsonHeaders() });
        }

        // Neither Live nor Upcoming (Live Image 404 and no Upcoming markers)
        // Likely a VOD or just offline.
        return new Response(JSON.stringify({
            isLive: false,
            isUpcoming: false,
            videoId: videoId, // Return the ID anyway as it was found
            channelTitle,
            finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
            message: 'Video ID found but not Live or Upcoming',
            debug: {
                extractionSource,
                verifyUrl,
                verifyStatus: imgResp.status,
                method: 'OFFLINE_CHECK'
            }
        }), { status: 200, headers: jsonHeaders() });

    } catch (err) {
        return new Response(JSON.stringify({
            error: 'Internal Error',
            message: err.message
        }), { status: 500, headers: jsonHeaders() });
    }
}

function jsonHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
    };
}

// 從頻道 /live 頁解析「官方頻道名」(涵蓋直播中與離線兩態)。
// 直播 watch 頁:og:title 可能是影片標題,故 "author"(videoDetails，在 playerResponse 區段)排第一;
// 離線頻道頁:og:title / itemprop=name(頁面前 5KB)/ channelMetadataRenderer.title 才是頻道名。
// page 是 readLiveOgPage 的結果：head＝前 64KB，player＝playerResponse 區段（離線頁提早停止時是空字串）
function extractChannelTitle(page) {
    if (!page) return null;
    const { head, player } = page;

    // 1. videoDetails.author(直播 watch 頁 → 頻道名;JSON 字串)
    const author = player.match(/"author":"((?:[^"\\]|\\.)*)"/);
    if (author) {
        const v = decodeJsonString(author[1]);
        if (v) return v;
    }

    // 2. og:title(離線頻道頁 → 頻道名;支援 property/content 兩種屬性順序)
    const og = head.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i)
        || head.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i);
    if (og) {
        const v = decodeHtmlEntities(og[1]).trim();
        if (v) return v;
    }

    // 3. itemprop="name"
    const ip = head.match(/<meta[^>]*itemprop=["']name["'][^>]*content=["']([^"']*)["']/i);
    if (ip) {
        const v = decodeHtmlEntities(ip[1]).trim();
        if (v) return v;
    }

    // 4. channelMetadataRenderer.title(JSON)
    // 離線頁提早停止讀取時 player 是空字串，這一步只在讀完整頁（player 退回整頁）時有作用
    const meta = player.match(/"channelMetadataRenderer":\{"title":"((?:[^"\\]|\\.)*)"/);
    if (meta) {
        const v = decodeJsonString(meta[1]);
        if (v) return v;
    }

    return null;
}

// 解 JSON 字串內容(\uXXXX、\"、\\ 等);失敗則回原字串 trim。
function decodeJsonString(raw) {
    try {
        return JSON.parse('"' + raw + '"').trim();
    } catch {
        return (raw || '').trim();
    }
}

// 解常見 HTML entity(og:title / meta content 用);&amp; 放最後避免二次解碼。
function decodeHtmlEntities(s) {
    if (!s) return '';
    return s
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, n) => safeFromCodePoint(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeFromCodePoint(parseInt(n, 16)))
        .replace(/&amp;/g, '&');
}

function safeFromCodePoint(code) {
    try {
        return String.fromCodePoint(code);
    } catch {
        return '';
    }
}
