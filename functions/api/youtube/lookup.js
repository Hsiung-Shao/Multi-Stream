// Cloudflare Pages Function：GET /api/youtube/lookup?videoId=… 或 ?channelId=…
//
// 2026-11-27 資安稽核 C 組：取代 /api/youtube-config（把 YouTube API 金鑰公開給所有人）。
// 金鑰只留在伺服器；前端改打這支，回傳格式與原本 youtubeApi.getVideoInfo／getChannelTitleFromChannelId 相同。
//   - 只接受本站頁面發出的請求＋每 IP 每小時 60 次（header 可偽造，真正防線仍是 WAF）
//   - Cache API 以 id 為鍵快取 1 天：同一支影片／頻道全站只花一次配額
//   - 查到的頻道名由伺服器寫進 youtube_channels（取代匿名可寫的 /api/youtube/cache-channel）

import { getCorsHeaders, isRequestFromAllowedSite } from '../../lib/cors.js';
import { checkQuotas, getVisitorIp, ipKey, quotaWindow } from '../../lib/rate-limit.js';
import { writeChannelCacheBackground } from '../../lib/youtube-channel-cache.js';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;
const CACHE_TTL_SECONDS = 86400;
const HOURLY_LIMIT_PER_IP = 60;
const YOUTUBE_TIMEOUT_MS = 8000;

function json(data, status, request, extra = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...getCorsHeaders(request, { methods: 'GET, OPTIONS' }),
            ...extra,
        },
    });
}

async function queryYoutube(env, kind, id) {
    const part = 'snippet';
    const url = `https://www.googleapis.com/youtube/v3/${kind}?part=${part}&id=${id}&key=${encodeURIComponent(env.YOUTUBE_API_KEY)}`;
    const res = await fetch(url, {
        headers: env.YOUTUBE_API_REFERER ? { Referer: env.YOUTUBE_API_REFERER } : {},
        signal: AbortSignal.timeout(YOUTUBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.items?.[0] ?? null;
}

export async function onRequestGet(context) {
    const { request, env } = context;
    if (!isRequestFromAllowedSite(request)) return json({ error: 'forbidden' }, 403, request);

    const url = new URL(request.url);
    const videoId = url.searchParams.get('videoId');
    const channelId = url.searchParams.get('channelId');
    let kind;
    let id;
    if (videoId && VIDEO_ID_RE.test(videoId)) {
        kind = 'videos';
        id = videoId;
    } else if (!videoId && channelId && CHANNEL_ID_RE.test(channelId)) {
        kind = 'channels';
        id = channelId;
    } else {
        return json({ error: 'invalid_id' }, 400, request);
    }
    if (!env?.YOUTUBE_API_KEY) return json({ error: 'unavailable' }, 503, request);

    const cache = typeof caches !== 'undefined' ? caches.default : null;
    // 正規化 key：只留 id，其他查詢參數一律忽略（避免加亂數繞過快取）
    const cacheKey = new Request(`${url.origin}/api/youtube/lookup?${kind === 'videos' ? 'videoId' : 'channelId'}=${id}`);
    if (cache) {
        const hit = await cache.match(cacheKey);
        if (hit) return json(await hit.json(), 200, request, { 'X-Edge-Cache': 'HIT' });
    }

    const ip = getVisitorIp(request);
    if (ip) {
        const quota = await checkQuotas(env.RATE_LIMIT_KV, [
            { key: `yt-lookup:${ipKey(ip)}:${quotaWindow().hour}`, limit: HOURLY_LIMIT_PER_IP, ttl: 3700 },
        ]);
        if (!quota.ok) return json({ error: 'rate_limited' }, 429, request);
    }

    let item;
    try {
        item = await queryYoutube(env, kind, id);
    } catch {
        return json({ error: 'upstream_failed' }, 502, request);
    }
    if (!item?.snippet) return json({ error: 'not_found' }, 404, request);

    const result = kind === 'videos'
        ? { title: item.snippet.title, channelId: item.snippet.channelId, channelTitle: item.snippet.channelTitle }
        : { channelId: id, channelTitle: item.snippet.title };

    // 伺服器自己查到的名稱才寫進共用的頻道快取
    context.waitUntil?.(writeChannelCacheBackground(env, result.channelId, result.channelTitle));
    if (cache) {
        context.waitUntil?.(cache.put(cacheKey, new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` },
        })));
    }
    return json(result, 200, request, { 'X-Edge-Cache': 'MISS' });
}

export function onRequestOptions(context) {
    return new Response(null, { status: 204, headers: getCorsHeaders(context.request, { methods: 'GET, OPTIONS' }) });
}
