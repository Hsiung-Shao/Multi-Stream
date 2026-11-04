// GET /embed/schedule/<slug>/card?lang=en|zh-TW&theme=light|dark&days=1..7
// 週表圖（SVG，1200×675＝16:9）：給放不了 iframe 的地方——Linktree Featured 版型、Threads／IG 貼文、Notion 圖片。
// 產生器（src/features/schedule/EmbedScheduleDialog.tsx）在瀏覽器把這張 SVG 畫到 canvas 轉成 PNG 下載。
// 頭像在 edge 抓一次轉 data URI 內嵌（原因見 schedule-embed.js），整張圖以 lang／theme／days 為 key 進 edge 快取。
import { resolveSchedulePerson } from '../../../lib/schedule-person.js';
import { EMBED_CACHE_TTL_S, EMBED_ERROR_TTL_S, EMBED_TEXT, avatarDataUri, embedResponseHeaders, parseEmbedOptions, personSubject, renderCardSvg, renderMessageSvg } from '../../../lib/schedule-embed.js';
import { recordReferrer } from '../../../lib/embed-stats.js';

const CACHE_ORIGIN = 'https://multistreaming.org/__edge-cache/schedule-card/v1/';
const SVG_TYPE = 'image/svg+xml; charset=utf-8';

const svg = (body, status, ttl) => new Response(body, { status, headers: { ...embedResponseHeaders(ttl, SVG_TYPE), 'Access-Control-Allow-Origin': '*' } });

/** deps 可注入（測試）：resolve、avatar、record、cache（null＝不快取） */
export async function handleCard(context, deps = {}) {
    const resolve = deps.resolve ?? resolveSchedulePerson;
    const avatar = deps.avatar ?? avatarDataUri;
    const record = deps.record ?? recordReferrer;
    const cache = deps.cache === undefined ? (globalThis.caches?.default ?? null) : deps.cache;
    const { request, env, params } = context;
    const url = new URL(request.url);
    const opts = parseEmbedOptions(url.searchParams);
    const t = EMBED_TEXT[opts.lang] ?? EMBED_TEXT.en;
    const raw = typeof params?.slug === 'string' ? params.slug : '';
    const slug = raw.toLowerCase();
    const key = new Request(`${CACHE_ORIGIN}${encodeURIComponent(slug)}?lang=${opts.lang}&theme=${opts.theme}&days=${opts.days}`);
    // 快取命中就不查資料庫；但只有正規小寫 slug 才會命中（大小寫不同的要先 301）
    if (cache && raw === slug) {
        const hit = await cache.match(key).catch(() => null);
        if (hit) {
            const stat = record({ request, env, kind: 'person', slug });
            if (context.waitUntil) context.waitUntil(stat);
            return hit;
        }
    }
    const person = await resolve(env, `/schedule/${raw}`);
    if (person.kind === 'redirect') {
        return Response.redirect(url.origin + person.location.replace('/schedule/', '/embed/schedule/') + '/card' + url.search, 301);
    }
    if (person.kind === 'error') return svg(renderMessageSvg(opts.theme, t.error), 503, EMBED_ERROR_TTL_S);
    if (person.kind !== 'found') return svg(renderMessageSvg(opts.theme, t.notFound), 404, EMBED_CACHE_TTL_S);
    const stat = record({ request, env, kind: 'person', slug });
    if (context.waitUntil) context.waitUntil(stat);
    const res = svg(renderCardSvg(personSubject(person, slug), opts, await avatar(person.image)), 200, EMBED_CACHE_TTL_S);
    if (cache) {
        const put = cache.put(key, res.clone()).catch(() => {});
        if (context.waitUntil) context.waitUntil(put);
        else await put;
    }
    return res;
}

export const onRequestGet = (context) => handleCard(context);
