// GET /embed/schedule/group/<uuid>/card?lang&theme&days — 團體週表圖（SVG 1200×675）；團體沒有頭像，畫純色圓。
import { EMBED_CACHE_TTL_S, EMBED_ERROR_TTL_S, EMBED_TEXT, embedResponseHeaders, parseEmbedOptions, renderCardSvg, renderMessageSvg } from '../../../../lib/schedule-embed.js';
import { resolveGroupEmbed } from '../../../../lib/schedule-group-embed.js';
import { recordReferrer } from '../../../../lib/embed-stats.js';

const SVG_TYPE = 'image/svg+xml; charset=utf-8';
const svg = (body, status, ttl) => new Response(body, { status, headers: { ...embedResponseHeaders(ttl, SVG_TYPE), 'Access-Control-Allow-Origin': '*' } });

export async function handleGroupCard(context, deps = {}) {
    const record = deps.record ?? recordReferrer;
    const { request, env, params } = context;
    const url = new URL(request.url);
    const opts = parseEmbedOptions(url.searchParams);
    const t = EMBED_TEXT[opts.lang] ?? EMBED_TEXT.en;
    const id = typeof params?.id === 'string' ? params.id : '';
    const r = await resolveGroupEmbed(env, id, deps.rpc, deps.cache === undefined ? undefined : deps.cache);
    if (r.kind === 'error') return svg(renderMessageSvg(opts.theme, t.error), 503, EMBED_ERROR_TTL_S);
    if (r.kind !== 'found') return svg(renderMessageSvg(opts.theme, t.notFound), 404, EMBED_CACHE_TTL_S);
    const stat = record({ request, env, kind: 'group', slug: id.toLowerCase() });
    if (context.waitUntil) context.waitUntil(stat);
    return svg(renderCardSvg(r.subject, opts, null), 200, EMBED_CACHE_TTL_S);
}

export const onRequestGet = (context) => handleGroupCard(context);
