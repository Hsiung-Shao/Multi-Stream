// GET /api/vtuber/channel-lookup?url=<YouTube 頻道網址或 @handle>
//
// 投稿表單輸入頻道網址後自動帶入名稱與頭像，並告訴前端「這個頻道已經在站上／已有待審投稿」。
// 只讀頻道頁前段（functions/lib/vtuber-submit.js lookupYoutubeChannel），零 API 配額。
// 只接受本站頁面發出的請求，並以雜湊 IP 限流（每小時 60 次、全站每小時 2000 次）。
//
// 回應：{ ok: true, channel: {channelId,title,avatarUrl,handle}, exists: {name,slug}|null, pending: boolean }
//       或 { ok: false, error: 'youtube_invalid_url'|'youtube_unsupported_url'|'not_found'|'fetch_failed'|'rate_limited'|'forbidden' }

import { jsonResponse, handleOptions, isRequestFromAllowedSite } from '../../lib/cors.js';
import { getVisitorIp, hashIp, checkQuotas, quotaWindow } from '../../lib/rate-limit.js';
import { parseYoutubeChannelInput, lookupYoutubeChannel } from '../../lib/vtuber-submit.js';
import { findExisting } from '../../lib/submit-guard.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function onRequestGet(context) {
    const { request, env } = context;
    const reply = (data, status = 200) => jsonResponse(data, status, request, NO_STORE, { methods: 'GET, OPTIONS' });
    if (!isRequestFromAllowedSite(request)) return reply({ ok: false, error: 'forbidden' }, 403);

    const parsed = parseYoutubeChannelInput(new URL(request.url).searchParams.get('url'));
    if (parsed.error) return reply({ ok: false, error: `youtube_${parsed.error}` }, 400);

    const ipHash = await hashIp(env, getVisitorIp(request));
    const w = quotaWindow();
    const quota = await checkQuotas(env.RATE_LIMIT_KV, [
        { key: `lookup:h:${ipHash}:${w.hour}`, limit: 60, ttl: 3700 },
        { key: `lookup:g:${w.hour}`, limit: 2000, ttl: 3700 },
    ]);
    if (!quota.ok) return reply({ ok: false, error: 'rate_limited' }, 429);

    const found = await lookupYoutubeChannel(parsed);
    if (!found.ok) return reply({ ok: false, error: found.error }, found.error === 'not_found' ? 404 : 502);

    const { exists, pending } = await findExisting(env, found.channel.channelId);
    return reply({ ok: true, channel: found.channel, exists, pending });
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
