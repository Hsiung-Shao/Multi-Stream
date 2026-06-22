export async function onRequestGet(context) {
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
            }), { status: 200, headers: jsonHeaders() });
        }

        const html = await htmlResp.text();

        // 順手解析「官方頻道名」供離線頻道資料庫蒐集用(零額外請求，HTML 已在手上）。
        // 在 videoId 瀑布前先取，確保所有 return 分支（含 offline / 找不到 videoId）都帶得出。
        const channelTitle = extractChannelTitle(html);

        // Debug: Try to find page title to see if we hit Consent page
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        const pageTitle = titleMatch ? titleMatch[1] : 'Unknown Title';

        // --- 3. Extract Video ID (Method Waterfall) ---
        // We don't necessarily need the og:image to be perfect, we just need the Video ID.
        // Once we have the ID, we can probe the Image Server for the _live.jpg existence.

        let videoId = null;
        let extractionSource = null;

        // Source 1: og:image (if it contains /vi/ID/)
        if (!videoId) {
            // ... (reuse regexes from before or simpler ones just for extraction)
            // Let's just grab the content of og:image / twitter:image / itemprop:image first
            let potentialImgUrl = null;
            const metaOg = html.match(/<meta\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']\s+content=["'](.*?)["']/i) ||
                html.match(/<meta\s+content=["'](.*?)["']\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']/i);

            if (metaOg) {
                potentialImgUrl = metaOg[1];
                const vidMatch = potentialImgUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
                if (vidMatch) {
                    videoId = vidMatch[1];
                    extractionSource = 'meta-image';
                }
            }
        }

        // Source 2: Canonical URL (Very reliable for /live redirects)
        // <link rel="canonical" href="https://www.youtube.com/watch?v=zlzBo4uh2iw">
        if (!videoId) {
            const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/i);
            if (canonicalMatch) {
                const href = canonicalMatch[1];
                // Check if it's a watch URL
                const vMatch = href.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
                if (vMatch) {
                    videoId = vMatch[1];
                    extractionSource = 'canonical-link';
                }
            }
        }

        // Source 3: og:url
        if (!videoId) {
            const ogUrlMatch = html.match(/<meta\s+property=["']og:url["']\s+content=["'](.*?)["']/i);
            if (ogUrlMatch && ogUrlMatch[1].includes('watch?v=')) {
                const vMatch = ogUrlMatch[1].match(/v=([a-zA-Z0-9_-]{11})/);
                if (vMatch) {
                    videoId = vMatch[1];
                    extractionSource = 'og-url';
                }
            }
        }

        // Source 4: Brute force any _live.jpg
        if (!videoId) {
            const liveImgMatch = html.match(/https:\/\/i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]{11})\/(?:maxres|hq)default_live\.jpg/);
            if (liveImgMatch) {
                videoId = liveImgMatch[1];
                extractionSource = 'brute-force-regex';
            }
        }

        if (!videoId) {
            return new Response(JSON.stringify({
                isLive: false,
                channelTitle,
                message: 'Video ID not found in HTML',
                debug: { liveUrl, pageTitle, snippet: html.substring(0, 1000) } // Increased snippet again
            }), { status: 200, headers: jsonHeaders() });
        }

        // --- 4. Verify with Image Server (HEAD Request) ---
        // We have a Candidate Video ID. Now we ask: "Is this video LIVE right now?"
        // Querying the specific live thumbnail is the logic.
        const verifyUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg`;

        const imgResp = await fetch(verifyUrl, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
            }
        });

        const isConfirmedLive = imgResp.status === 200;

        // --- 5. Check for UPCOMING markers locally (HTML Parse) ---
        // Even if the image exists (200), it might be a scheduled stream that generated a thumb.
        // We trust the HTML "Upcoming" markers to override the purely image-based Live check.

        let isUpcoming = false;
        let scheduledStartTime = null;

        // Pattern 1: "status":"UPCOMING"
        if (html.includes('"status":"UPCOMING"')) {
            isUpcoming = true;
        }

        // Pattern 2: "isUpcoming":true
        if (!isUpcoming && html.includes('"isUpcoming":true')) {
            isUpcoming = true;
        }

        // Attempt to find start time
        // "scheduledStartTime":"1703851200"
        const timeMatch = html.match(/"scheduledStartTime"\s*:\s*"(\d+)"/);
        if (timeMatch) {
            isUpcoming = true; // Presence of start time strongly implies upcoming
            scheduledStartTime = timeMatch[1];
        }

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
                    verifyStatus: imgResp.status,
                    method: 'HTML_PARSE_UPCOMING',
                    liveUrl
                }
            }), { status: 200, headers: jsonHeaders() });
        }

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

// 從頻道 /live 頁 HTML 解析「官方頻道名」(涵蓋直播中與離線兩態)。
// 直播 watch 頁:og:title 可能是影片標題,故 "author"(videoDetails)排第一;
// 離線頻道頁:og:title / itemprop=name / channelMetadataRenderer.title 才是頻道名。
function extractChannelTitle(html) {
    if (!html) return null;

    // 1. videoDetails.author(直播 watch 頁 → 頻道名;JSON 字串)
    const author = html.match(/"author":"((?:[^"\\]|\\.)*)"/);
    if (author) {
        const v = decodeJsonString(author[1]);
        if (v) return v;
    }

    // 2. og:title(離線頻道頁 → 頻道名;支援 property/content 兩種屬性順序)
    const og = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i);
    if (og) {
        const v = decodeHtmlEntities(og[1]).trim();
        if (v) return v;
    }

    // 3. itemprop="name"
    const ip = html.match(/<meta[^>]*itemprop=["']name["'][^>]*content=["']([^"']*)["']/i);
    if (ip) {
        const v = decodeHtmlEntities(ip[1]).trim();
        if (v) return v;
    }

    // 4. channelMetadataRenderer.title(JSON)
    const meta = html.match(/"channelMetadataRenderer":\{"title":"((?:[^"\\]|\\.)*)"/);
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
