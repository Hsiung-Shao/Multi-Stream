// 建置後預渲染（SSG）：把靜態內容頁烘成帶內文的實體 HTML。
//
// 流程（由 package.json 的 build script 串起）：
//   vite build（client）→ vite build --ssr src/entry-server.tsx --outDir build-ssr → 本檔
// 本檔對 entry-server 匯出的每條路由 × {zh-TW, en}：
//   1. 用 React renderToPipeableStream 產出 #root 的 innerHTML（含 Suspense 標記，client 可 hydrate）
//   2. 以 build/index.html 為殼，注入 #root，並用 functions/lib/seo-meta.js 的 ROUTE_META 改寫 head
//      （與 functions/[[path]].js 同一來源；Function 之後再改一次是冪等的）
//   3. 寫到 build/_prerender/<lang>/<route>.html；functions/[[path]].js 依 Accept-Language 取檔
// 任一路由失敗 → exit 1 讓整個 build 失敗（不靜默退回空殼 SPA）。
// SSR bundle 把 react / react-dom 留在 external，由 Node 依 NODE_ENV 選 dev 或 production build；
// 沒設就會跑 dev build（慢、且每個 useLayoutEffect 都吐 SSR 警告）。要在任何 import 之前設定。
process.env.NODE_ENV ??= 'production';

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROUTE_META, OG_LOCALE, ROBOTS_INDEX, WEBAPP_JSONLD_ROUTES } from '../functions/lib/seo-meta.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(rootDir, 'build');
const ssrDir = path.join(rootDir, 'build-ssr');
const outRoot = path.join(buildDir, '_prerender');
const ORIGIN = 'https://multistreaming.org';

function fail(msg) {
    console.error(`❌ prerender: ${msg}`);
    process.exit(1);
}

const escapeHtml = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 精確替換一個既有標籤的屬性值；找不到或找到多個都視為殼變形，直接失敗 */
function replaceOnce(html, regex, replacement, what) {
    const matches = html.match(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'));
    if (!matches || matches.length !== 1) {
        fail(`build/index.html 裡 ${what} 出現 ${matches ? matches.length : 0} 次（預期 1 次），殼結構與本腳本不符`);
    }
    return html.replace(regex, replacement);
}

const setMeta = (html, attr, key, content) =>
    replaceOnce(
        html,
        new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`),
        `$1${escapeHtml(content)}$2`,
        `<meta ${attr}="${key}">`,
    );

/** 與 functions/[[path]].js 的 HTMLRewriter 做同一組改寫（title / description / canonical / og / twitter / lang） */
export function applyHead(shell, route, lang, theme, appHtml) {
    const entry = ROUTE_META[route];
    if (!entry) fail(`ROUTE_META 沒有 ${route}`);
    const meta = entry[lang];
    const pageUrl = ORIGIN + route;
    const ogType = entry.type === 'article' ? 'article' : 'website';

    let out = shell;
    // data-prerender-*：src/main.tsx 的 hydrate 閘門用它判斷「這份 HTML 烘的語言/主題與使用者相同」
    out = replaceOnce(
        out,
        /<html lang="[^"]*">/,
        `<html lang="${lang}" data-prerender-lang="${lang}" data-prerender-theme="${theme}">`,
        '<html lang>',
    );
    out = replaceOnce(out, /<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`, '<title>');
    out = setMeta(out, 'name', 'title', meta.title);
    out = setMeta(out, 'name', 'description', meta.description);
    out = setMeta(out, 'name', 'robots', ROBOTS_INDEX);
    out = setMeta(out, 'property', 'og:title', meta.title);
    out = setMeta(out, 'property', 'og:description', meta.description);
    out = setMeta(out, 'property', 'og:url', pageUrl);
    out = setMeta(out, 'property', 'og:locale', OG_LOCALE[lang]);
    out = setMeta(out, 'property', 'og:type', ogType);
    out = setMeta(out, 'name', 'twitter:title', meta.title);
    out = setMeta(out, 'name', 'twitter:description', meta.description);
    out = setMeta(out, 'name', 'twitter:url', pageUrl);
    out = replaceOnce(out, /(<link rel="canonical" href=")[^"]*(")/, `$1${escapeHtml(pageUrl)}$2`, '<link rel="canonical">');
    if (!WEBAPP_JSONLD_ROUTES.includes(route)) {
        out = replaceOnce(
            out,
            /\s*<script type="application\/ld\+json" id="ld-webapp">[\s\S]*?<\/script>/,
            '',
            'script#ld-webapp',
        );
    }
    out = replaceOnce(out, /<div id="root"><\/div>/, () => `<div id="root">${appHtml}</div>`, '<div id="root">');
    return out;
}

/**
 * 輸出檔路徑：/about/creator → about/creator.html（Pages 對 x.html 在 /x 提供服務，Function 取檔不帶 .html）。
 * 首頁刻意不叫 index.html：Pages 會把 /dir/index 正規化成 /dir/ 的 308，ASSETS.fetch 拿不到 200。
 * 與 functions/[[path]].js 的 prerenderPathFor 必須一致。
 */
export const ROOT_FILE = 'root';
/** build/ 相對路徑（POSIX 分隔），tests/functions/prerender.test.ts 拿它比對 Function 的取檔路徑 */
export const outRelFor = (lang, route) =>
    `_prerender/${lang}/${route === '/' ? ROOT_FILE : route.slice(1)}.html`;
const outFileFor = (lang, route) => path.join(buildDir, ...outRelFor(lang, route).split('/'));

async function main() {
    if (!existsSync(path.join(buildDir, 'index.html'))) fail('build/index.html 不存在，先跑 vite build');
    if (!existsSync(ssrDir)) fail('build-ssr/ 不存在，先跑 vite build --ssr src/entry-server.tsx');
    const entryFile = readdirSync(ssrDir).find((f) => /^entry-server\.(m?js)$/.test(f));
    if (!entryFile) fail('build-ssr/ 裡找不到 entry-server.(m)js');

    const shell = readFileSync(path.join(buildDir, 'index.html'), 'utf8');
    const { render, PRERENDER_ROUTES, PRERENDER_LANGS, PRERENDER_THEME } = await import(pathToFileURL(path.join(ssrDir, entryFile)).href);

    rmSync(outRoot, { recursive: true, force: true });
    let count = 0;
    for (const lang of PRERENDER_LANGS) {
        for (const route of PRERENDER_ROUTES) {
            let appHtml;
            try {
                appHtml = await render(route, lang);
            } catch (err) {
                console.error(err);
                fail(`${route} (${lang}) 渲染失敗`);
            }
            // 內容健檢：空殼 / 沒有 H1 都不是我們要的產物
            if (appHtml.length < 500) fail(`${route} (${lang}) 內容過短（${appHtml.length} bytes），疑似空殼`);
            if (!/<h1[\s>]/.test(appHtml)) fail(`${route} (${lang}) 沒有 <h1>`);
            const html = applyHead(shell, route, lang, PRERENDER_THEME, appHtml);
            if (/%(SEO_[A-Z_]+|APP_VERSION|BUILD_DATE)%/.test(html)) fail(`${route} (${lang}) 仍含未替換佔位`);

            const file = outFileFor(lang, route);
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, html, 'utf8');
            count++;
        }
    }
    rmSync(ssrDir, { recursive: true, force: true });
    console.log(`✅ prerender: ${count} 檔（${PRERENDER_ROUTES.length} 路由 × ${PRERENDER_LANGS.length} 語言）→ build/_prerender/`);
}

// 只在直接執行（node scripts/prerender.mjs）時跑；被測試 import 時只取用上面的純函式
const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
    main().catch((err) => {
        console.error(err);
        fail('未預期的錯誤');
    });
}
