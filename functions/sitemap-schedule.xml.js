// 動態 sitemap：列出可索引（頁面有內容：直播中、未來 7 天排程或近 90 天結束的場次；vtubers.schedule_indexable）的個人週表頁。
// 靜態 sitemap.xml 維持一比一對照 PAGE_PATHS（tests/functions/sitemap.test.ts），個人頁另外走這支；robots.txt 兩個都列。
// schedule_indexable 由排程 Heavy 每圈更新（refresh_schedule_indexable），這裡只讀。
import { select } from './lib/supabase-server.js';
import { HREFLANGS, withLang, alternates } from './lib/locale.js';

const ORIGIN = 'https://multistreaming.org';
const PAGE = 1000; // PostgREST 預設 max-rows；超過要分頁（memory：1000 筆靜默截斷）
const MAX_PAGES = 50; // 5 萬筆＝單一 sitemap 上限

const xmlEscape = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

/** 由列資料產生 sitemap XML（抽出來給測試用）：每人兩筆（英文 /schedule/<slug>、繁中 /zh-TW/schedule/<slug>），各帶 hreflang */
export function buildScheduleSitemap(rows) {
    const urls = rows
        .filter((r) => typeof r.slug === 'string' && /^[a-z0-9][a-z0-9_-]{1,39}$/.test(r.slug))
        .flatMap((r) => {
            const lastmod = typeof r.last_live_at === 'string' && r.last_live_at ? `<lastmod>${xmlEscape(r.last_live_at.slice(0, 10))}</lastmod>` : '';
            const path = `/schedule/${r.slug}`;
            const links = alternates(ORIGIN, path)
                .map(({ hreflang, href }) => `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}"/>`)
                .join('');
            return HREFLANGS.map((lang) => `<url><loc>${ORIGIN}${withLang(lang, path)}</loc>${lastmod}${links}</url>`);
        });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

export async function onRequestGet(context) {
    const { env } = context;
    const rows = [];
    for (let i = 0; i < MAX_PAGES; i++) {
        const res = await select(env, `vtubers?select=slug,last_live_at&schedule_indexable=eq.true&order=slug.asc&limit=${PAGE}&offset=${i * PAGE}`);
        if (!res.ok || !Array.isArray(res.data)) {
            // 讀不到就回 503，讓爬蟲稍後重試；不能回空 sitemap（會被當成「沒有頁面」）
            return new Response('sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '3600' } });
        }
        rows.push(...res.data);
        if (res.data.length < PAGE) break;
    }
    return new Response(buildScheduleSitemap(rows), {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            // 每圈排程約 1 小時更新一次可索引名單；edge 與瀏覽器快取 1 小時
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
