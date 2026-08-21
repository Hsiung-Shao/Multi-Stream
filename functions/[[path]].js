// Catch-all Pages Function：對 SPA 的 HTML 路由做 edge 層 SEO 處理。
// 目的：
//   1. per-route meta —— 不執行 JS 的爬蟲（GPTBot/ClaudeBot/OG scraper…）也能拿到各頁正確的
//      title/description/canonical/og:*，而不是全部看到首頁的靜態 meta。
//   2. 真 404 —— 未知路徑回 HTTP 404（原本 SPA fallback 一律 200 造成軟 404）。
//   3. 舊路徑 301（/tools、*.html 別名；原 _redirects 從未被部署，見 scripts/copy-static-assets.js）。
// 路由範圍由 public/_routes.json 控制：靜態資產（/assets/*、圖檔、robots/sitemap/llms…）已排除，
// 不會消耗 function 呼叫；functions/api/* 是更具體路由，優先於本 catch-all。
// ⚠ _headers 不套用到 Function 回應 → 安全標頭由 functions/lib/security-headers.js 帶（測試鎖同步）。
import { ROUTE_META, NOT_FOUND_META, OG_LOCALE, ROBOTS_INDEX, ROBOTS_NOINDEX, WEBAPP_JSONLD_ROUTES } from './lib/seo-meta.js';
import { HTML_SECURITY_HEADERS } from './lib/security-headers.js';

const ORIGIN = 'https://multistreaming.org';

// 舊路徑 → 新路徑（301）。對應 src/config/routes.ts 的 LEGACY_HTML_ALIASES + 已下線的 /tools。
const REDIRECTS = {
    '/tools': '/canvas',
    '/index.html': '/',
    '/about.html': '/about',
    '/privacy.html': '/privacy',
};

// Accept-Language 含任何 zh 變體 → zh-TW；其餘（含沒帶 header 的 Googlebot / OG scraper）→ en。
// 與前端 i18next 的 navigator 偵測方向一致（zh 系使用者看中文、其他看英文）。
function pickLang(acceptLanguage) {
    return acceptLanguage && /(^|[,;\s])zh\b/i.test(acceptLanguage) ? 'zh-TW' : 'en';
}

const setContent = (value) => ({
    element(el) {
        el.setAttribute('content', value);
    },
});

export async function onRequest(context) {
    const { request, env, next } = context;
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();

    const url = new URL(request.url);
    const rawPath = url.pathname;

    // 統一去尾斜線（/canvas/ → /canvas），保留查詢字串
    if (rawPath.length > 1 && rawPath.endsWith('/')) {
        const clean = rawPath.replace(/\/+$/, '') || '/';
        return Response.redirect(url.origin + clean + url.search, 301);
    }
    // Object.hasOwn：避免 /constructor、/toString 這類原型鏈 key 被當成已知路由
    if (Object.hasOwn(REDIRECTS, rawPath)) {
        return Response.redirect(url.origin + REDIRECTS[rawPath], 301);
    }

    const entry = Object.hasOwn(ROUTE_META, rawPath) ? ROUTE_META[rawPath] : undefined;
    const lang = pickLang(request.headers.get('accept-language'));
    const meta = entry ? entry[lang] : NOT_FOUND_META[lang];
    const status = entry ? 200 : 404;
    const noindex = !entry || entry.noindex === true;
    const pageUrl = ORIGIN + rawPath;

    // 取 SPA shell。一定用「乾淨的」Request：轉發原請求的 If-None-Match 等條件標頭
    // 可能拿到無 body 的 304，HTMLRewriter 會無內容可改。
    const shell = await env.ASSETS.fetch(new Request(url.origin + '/'));

    // og:type：教學文章為 article，其餘 website（index.html 靜態值為 website）
    const ogType = entry && entry.type === 'article' ? 'article' : 'website';
    // WebApplication JSON-LD 只在 / 與 /canvas 輸出；其他路由移除，避免每個子頁都宣告「我是這個應用程式」
    // （頁面專屬 schema 由前端 <SEO jsonLd> 注入：AboutPage / TechArticle / BreadcrumbList…）
    const keepWebAppJsonLd = WEBAPP_JSONLD_ROUTES.includes(rawPath);

    const rewriter = new HTMLRewriter()
        .on('html', {
            element(el) {
                el.setAttribute('lang', lang);
            },
        })
        .on('title', {
            element(el) {
                el.setInnerContent(meta.title);
            },
        })
        .on('meta[name="title"]', setContent(meta.title))
        .on('meta[name="description"]', setContent(meta.description))
        .on('meta[name="robots"]', setContent(noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX))
        .on('meta[property="og:title"]', setContent(meta.title))
        .on('meta[property="og:description"]', setContent(meta.description))
        .on('meta[property="og:url"]', setContent(pageUrl))
        .on('meta[property="og:locale"]', setContent(OG_LOCALE[lang]))
        .on('meta[property="og:type"]', setContent(ogType))
        .on('meta[name="twitter:title"]', setContent(meta.title))
        .on('meta[name="twitter:description"]', setContent(meta.description))
        .on('meta[name="twitter:url"]', setContent(pageUrl))
        .on(
            'link[rel="canonical"]',
            noindex
                ? {
                      element(el) {
                          el.remove();
                      },
                  }
                : {
                      element(el) {
                          el.setAttribute('href', pageUrl);
                      },
                  },
        );
    if (!keepWebAppJsonLd) {
        rewriter.on('script#ld-webapp', {
            element(el) {
                el.remove();
            },
        });
    }
    const transformed = rewriter.transform(shell);

    const headers = new Headers(transformed.headers);
    for (const [key, value] of Object.entries(HTML_SECURITY_HEADERS)) headers.set(key, value);
    // 回應內容依 Accept-Language 而異，告知中間層快取
    headers.set('Vary', 'Accept-Language');
    if (rawPath === '/admin') headers.set('X-Robots-Tag', 'noindex, follow');

    if (request.method === 'HEAD') return new Response(null, { status, headers });
    return new Response(transformed.body, { status, headers });
}
