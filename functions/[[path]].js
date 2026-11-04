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
import { resolveSchedulePerson, schedulePersonMeta, renderPersonBodyHtml } from './lib/schedule-person.js';
import { DEFAULT_LANG, splitLangPath, withLang, alternates } from './lib/locale.js';
import { resolveDirectory, renderDirectoryBodyHtml } from './lib/vtuber-directory.js';

/** 名錄頁：在 ROUTE_META 白名單裡（200、一般 meta），內文由 edge 注入（不預渲染；src/entry-server.tsx CSR_ONLY） */
const DIRECTORY_ROUTE = '/vtubers';

const ORIGIN = 'https://multistreaming.org';

// 週表 snapshot 預載：href 要和 src/features/schedule/snapshotSource.ts 的 SNAPSHOT_PROXY_PATH 一致；
// as=fetch 必須帶 crossorigin（anonymous＝credentials same-origin，對上前端預設的 fetch），否則預載不會被重用
export const SCHEDULE_SNAPSHOT_PRELOAD_ROUTE = '/schedule';
export const SCHEDULE_SNAPSHOT_PRELOAD_TAG = '<link rel="preload" href="/api/schedule/snapshot" as="fetch" crossorigin="anonymous">';

// 舊路徑 → 新路徑（301）。對應 src/config/routes.ts 的 LEGACY_HTML_ALIASES + 已下線的 /tools。
const REDIRECTS = {
    '/tools': '/canvas',
    '/index.html': '/',
    '/about.html': '/about',
    '/privacy.html': '/privacy',
};

// 語言只由網址決定（functions/lib/locale.js）：/zh-TW/... → 繁中、其他 → 英文。不看瀏覽器語言標頭，
// 同一網址對所有人（含 Googlebot）內容相同；繁中使用者開到無前綴網址由 index.html 的 head 腳本轉去 /zh-TW。

/**
 * 預渲染檔的 ASSETS 取檔路徑（不帶 .html：Pages 對 x.html 在 /x 提供服務，帶 .html 反而會 308）。
 * 首頁對應 root.html（不能叫 index.html，Pages 會把 /dir/index 正規化成 /dir/ 的 308）。
 * 與 scripts/prerender.mjs 的 outFileFor / ROOT_FILE 必須一致（tests/functions/prerender.test.ts 鎖）。
 */
export function prerenderPathFor(lang, rawPath) {
    return `/_prerender/${lang}${rawPath === '/' ? '/root' : rawPath}`;
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
    const fullPath = url.pathname;

    // 統一去尾斜線（/canvas/ → /canvas、/zh-TW/ → /zh-TW），保留查詢字串
    if (fullPath.length > 1 && fullPath.endsWith('/')) {
        const clean = fullPath.replace(/\/+$/, '') || '/';
        return Response.redirect(url.origin + clean + url.search, 301);
    }
    // 語言前綴：/zh-TW/about → lang zh-TW、rawPath /about；/zh-tw/about（大小寫不對）→ 301 到正規寫法
    const split = splitLangPath(fullPath);
    if (split.redirect) {
        return Response.redirect(url.origin + split.redirect + url.search, 301);
    }
    const lang = split.lang ?? DEFAULT_LANG;
    const rawPath = split.path;
    // Object.hasOwn：避免 /constructor、/toString 這類原型鏈 key 被當成已知路由
    if (Object.hasOwn(REDIRECTS, rawPath)) {
        return Response.redirect(url.origin + withLang(lang, REDIRECTS[rawPath]), 301);
    }

    const entry = Object.hasOwn(ROUTE_META, rawPath) ? ROUTE_META[rawPath] : undefined;
    const pageUrl = ORIGIN + withLang(lang, rawPath);

    // 個人週表頁 /schedule/<slug>：slug 是資料庫任意值，不在 ROUTE_META 白名單裡，查一次資料庫決定
    // 200（注入該實況主的 title/description/og:image，不活躍 → noindex）、301（大小寫）或真 404。
    // 查詢失敗時照常回 SPA 殼＋週表通用 meta：暫時性錯誤不能讓頁面被當成 404 或 noindex。
    const person = entry ? { kind: 'none' } : await resolveSchedulePerson(env, rawPath);
    if (person.kind === 'redirect') {
        return Response.redirect(url.origin + withLang(lang, person.location) + url.search, 301);
    }
    let meta;
    let status;
    let noindex;
    let image = null;
    if (person.kind === 'found') {
        meta = schedulePersonMeta(lang, person.name, person.indexable ? person.streams : null);
        status = 200;
        noindex = !person.indexable;
        image = person.image;
    } else if (person.kind === 'error') {
        meta = ROUTE_META['/schedule'][lang];
        status = 200;
        noindex = false;
    } else {
        meta = entry ? entry[lang] : NOT_FOUND_META[lang];
        status = entry ? 200 : 404;
        noindex = !entry || entry.noindex === true;
    }

    // 取 shell。一定用「乾淨的」Request：轉發原請求的 If-None-Match 等條件標頭
    // 可能拿到無 body 的 304，HTMLRewriter 會無內容可改。
    // 已知路由優先取預渲染 HTML（scripts/prerender.mjs 產出 build/_prerender/<lang>/<route>.html，
    // 帶完整內文，供爬蟲與首屏 LCP）；CSR-only 路由（/canvas、/admin）、404 或取檔失敗 → 空殼 index.html。
    const prerenderPath = entry ? prerenderPathFor(lang, rawPath) : null;
    let shell = prerenderPath ? await env.ASSETS.fetch(new Request(url.origin + prerenderPath)) : null;
    if (!shell || shell.status !== 200) {
        shell = await env.ASSETS.fetch(new Request(url.origin + '/'));
    }

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
        )
        // hreflang：殼裡既有的先拿掉（冪等），可索引頁再於 head 末端補上 en／zh-TW／x-default；noindex 頁不給語言訊號
        .on('link[rel="alternate"][hreflang]', {
            element(el) {
                el.remove();
            },
        });
    if (!noindex) {
        // href 來自 URL.pathname（已百分比編碼），仍跳脫引號以防日後改動
        const links = alternates(ORIGIN, rawPath)
            .map(({ hreflang, href }) => `<link rel="alternate" hreflang="${hreflang}" href="${href.replace(/"/g, '&quot;')}">`)
            .join('');
        rewriter.on('head', {
            element(el) {
                el.append(links, { html: true });
            },
        });
    }
    if (image) {
        // 頭像不是 1200×630：拿掉寬高宣告，alt 改成實況主名字所在的標題
        const drop = { element(el) { el.remove(); } };
        rewriter
            .on('meta[property="og:image"]', setContent(image))
            .on('meta[name="twitter:image"]', setContent(image))
            .on('meta[property="og:image:width"]', drop)
            .on('meta[property="og:image:height"]', drop)
            .on('meta[property="og:image:alt"]', setContent(meta.title))
            .on('meta[name="twitter:image:alt"]', setContent(meta.title));
    }
    if (rawPath === DIRECTORY_ROUTE) {
        // 名錄頁：和個人頁同模式（空殼＋edge 內文）；RPC 失敗就只回空殼，仍是 200 可索引（暫時性錯誤不毀收錄）
        const dir = await resolveDirectory(env);
        if (dir.ok) {
            const bodyHtml = renderDirectoryBodyHtml(lang, dir.data);
            rewriter.on('div#root', {
                element(el) {
                    el.setInnerContent(bodyHtml, { html: true });
                },
            });
        }
    }
    if (person.kind === 'found') {
        // 個人頁 shell 是空的 index.html：把這一頁獨有的內文（名字、場次摘要、場次清單、頻道連結）放進 #root，
        // 不跑 JS 的爬蟲與第一波索引才看得到內容（GSC「已檢索 - 目前尚未建立索引」）。React 掛載時會整個換掉。
        const bodyHtml = renderPersonBodyHtml(lang, person, rawPath.slice('/schedule/'.length));
        rewriter.on('div#root', {
            element(el) {
                el.setInnerContent(bodyHtml, { html: true });
            },
        });
    }
    if (rawPath === SCHEDULE_SNAPSHOT_PRELOAD_ROUTE) {
        // 週表頁一進來就要 snapshot：讓它和 JS 同時下載，不必等 SchedulePage chunk 跑起來才開始抓
        rewriter.on('head', {
            element(el) {
                el.append(SCHEDULE_SNAPSHOT_PRELOAD_TAG, { html: true });
            },
        });
    }
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
    if (rawPath === '/admin') headers.set('X-Robots-Tag', 'noindex, follow');

    if (request.method === 'HEAD') return new Response(null, { status, headers });
    return new Response(transformed.body, { status, headers });
}
