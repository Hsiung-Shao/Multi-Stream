// GET /embed/schedule/group/<uuid>?lang&theme&days — 團體（公司／團）的開台週表嵌入頁（成員直播中＋7 天內排程）。
// 渲染同個人嵌入（functions/lib/schedule-embed.js），每列多成員名；資料見 functions/lib/schedule-group-embed.js。
import { EMBED_CACHE_TTL_S, EMBED_ERROR_TTL_S, EMBED_TEXT, embedResponseHeaders, parseEmbedOptions, renderEmbedHtml, renderMessageHtml } from '../../../lib/schedule-embed.js';
import { resolveGroupEmbed } from '../../../lib/schedule-group-embed.js';
import { recordReferrer } from '../../../lib/embed-stats.js';

const html = (body, status, ttl) => new Response(body, { status, headers: embedResponseHeaders(ttl) });

/** deps 可注入（測試）：rpc（anonRpc 同介面）、record、cache */
export async function handleGroupEmbed(context, deps = {}) {
    const record = deps.record ?? recordReferrer;
    const { request, env, params } = context;
    const url = new URL(request.url);
    const opts = parseEmbedOptions(url.searchParams);
    const t = EMBED_TEXT[opts.lang] ?? EMBED_TEXT.en;
    const id = typeof params?.id === 'string' ? params.id : '';
    const r = await resolveGroupEmbed(env, id, deps.rpc, deps.cache === undefined ? undefined : deps.cache);
    if (r.kind === 'error') return html(renderMessageHtml(opts.lang, opts.theme, t.error), 503, EMBED_ERROR_TTL_S);
    if (r.kind !== 'found') return html(renderMessageHtml(opts.lang, opts.theme, t.notFound), 404, EMBED_CACHE_TTL_S);
    const stat = record({ request, env, kind: 'group', slug: id.toLowerCase() });
    if (context.waitUntil) context.waitUntil(stat);
    return html(renderEmbedHtml(r.subject, opts), 200, EMBED_CACHE_TTL_S);
}

export const onRequestGet = (context) => handleGroupEmbed(context);
