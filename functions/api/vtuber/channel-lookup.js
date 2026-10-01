// GET /api/vtuber/channel-lookup?url=<YouTube 頻道網址或 @handle>
//
// 投稿表單輸入頻道網址後自動帶入名稱與頭像，並告訴前端「這個頻道已經在站上／已有待審投稿」。
// 只讀頻道頁前段（functions/lib/vtuber-submit.js lookupYoutubeChannel），零 API 配額。
// 只接受本站頁面發出的請求；同一個輸入的結果在 edge 快取 10 分鐘（查詢本身不寫 KV：
// KV 免費方案每日寫入額度只有 1,000 次，而且同一個 key 每秒只能寫約 1 次，不適合每次輸入都計數）。
// 「是否已在站上」每次都查資料庫（不快取，剛核准的人要立刻看得到）。
//
// 回應：{ ok: true, channel: {channelId,title,avatarUrl,handle}, exists: {name,slug}|null, pending: boolean }
//       或 { ok: false, error: 'youtube_invalid_url'|'youtube_unsupported_url'|'not_found'|'fetch_failed'|'rate_limited'|'forbidden' }

import { jsonResponse, handleOptions, isRequestFromAllowedSite } from '../../lib/cors.js';
import { parseYoutubeChannelInput, lookupYoutubeChannel } from '../../lib/vtuber-submit.js';
import { findExisting } from '../../lib/submit-guard.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function onRequestGet(context) {
    const { request, env } = context;
    const reply = (data, status = 200) => jsonResponse(data, status, request, NO_STORE, { methods: 'GET, OPTIONS' });
    if (!isRequestFromAllowedSite(request)) return reply({ ok: false, error: 'forbidden' }, 403);

    const parsed = parseYoutubeChannelInput(new URL(request.url).searchParams.get('url'));
    if (parsed.error) return reply({ ok: false, error: `youtube_${parsed.error}` }, 400);

    const found = await cachedLookup(parsed, context);
    if (!found.ok) return reply({ ok: false, error: found.error }, found.error === 'not_found' ? 404 : 502);

    const { exists, pending } = await findExisting(env, found.channel.channelId);
    return reply({ ok: true, channel: found.channel, exists, pending });
}

const CACHE_TTL_SECONDS = 600;

/** 頻道查詢結果的 edge 快取（只快取成功與 not_found；抓取失敗不快取） */
async function cachedLookup(parsed, context) {
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const key = new Request(`https://lookup.invalid/${parsed.kind}/${encodeURIComponent(parsed.kind === 'id' ? parsed.channelId : parsed.handle.toLowerCase())}`);
    if (cache) {
        const hit = await cache.match(key);
        if (hit) return hit.json();
    }
    const found = await lookupYoutubeChannel(parsed);
    if (cache && (found.ok || found.error === 'not_found')) {
        context.waitUntil?.(cache.put(key, new Response(JSON.stringify(found), { headers: { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` } })));
    }
    return found;
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
