// GET /embed/schedule/<slug>?lang=en|zh-TW&theme=light|dark&days=1..7
// 可嵌入的個人開台週表（直播班表小工具）：給 VTuber／粉絲放進自己的網站、Blog、Notion 的 iframe 內容。
// 渲染與設計原則見 functions/lib/schedule-embed.js；資料沿用個人頁的 resolveSchedulePerson（slug 驗證＋edge 快取 5 分鐘）。
import { resolveSchedulePerson } from '../../lib/schedule-person.js';
import { EMBED_CACHE_TTL_S, EMBED_ERROR_TTL_S, EMBED_TEXT, embedResponseHeaders, parseEmbedOptions, personSubject, renderEmbedHtml, renderMessageHtml } from '../../lib/schedule-embed.js';
import { recordReferrer } from '../../lib/embed-stats.js';

const html = (body, status, ttl) => new Response(body, { status, headers: embedResponseHeaders(ttl) });

/** deps 可注入（測試）：resolve＝resolveSchedulePerson、record＝recordReferrer */
export async function handleEmbed(context, deps = {}) {
    const resolve = deps.resolve ?? resolveSchedulePerson;
    const record = deps.record ?? recordReferrer;
    const { request, env, params } = context;
    const url = new URL(request.url);
    const opts = parseEmbedOptions(url.searchParams);
    const t = EMBED_TEXT[opts.lang] ?? EMBED_TEXT.en;
    const raw = typeof params?.slug === 'string' ? params.slug : '';
    const person = await resolve(env, `/schedule/${raw}`);
    if (person.kind === 'redirect') {
        return Response.redirect(url.origin + person.location.replace('/schedule/', '/embed/schedule/') + url.search, 301);
    }
    if (person.kind === 'error') return html(renderMessageHtml(opts.lang, opts.theme, t.error), 503, EMBED_ERROR_TTL_S);
    if (person.kind !== 'found') return html(renderMessageHtml(opts.lang, opts.theme, t.notFound), 404, EMBED_CACHE_TTL_S);
    const slug = raw.toLowerCase();
    const stat = record({ request, env, kind: 'person', slug });
    if (context.waitUntil) context.waitUntil(stat);
    return html(renderEmbedHtml(personSubject(person, slug), opts), 200, EMBED_CACHE_TTL_S);
}

export const onRequestGet = (context) => handleEmbed(context);
