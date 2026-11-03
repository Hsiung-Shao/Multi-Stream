// 語言網址的單一來源：前端（src/config/routes.ts、SEO.tsx）、預渲染（scripts/prerender.mjs）、
// edge（functions/[[path]].js）、兩個 sitemap 都 import 這一份；純 ESM、零依賴。
// 型別給前端用 JSDoc（tsconfig allowJs）；不放 .d.ts：functions/ 下任何 .ts 都會被 Pages Functions 建置當成模組而失敗。
//
// 網址模型：英文（預設、x-default）維持無前綴 `/about`；繁中住在 `/zh-TW/about`（首頁 `/zh-TW`，無尾斜線）。
// zh-CN／ja／ko 只有介面切換、沒有網址（無前綴網址 ≠ 強制英文，只是「非 zh-TW」）。

/** @typedef {'en' | 'zh-TW'} UrlLang */

/** @type {'en'} */
export const DEFAULT_LANG = 'en';
/** 有網址前綴的語言 @type {readonly string[]} */
export const URL_LANGS = ['zh-TW'];
/** 輸出 hreflang 的語言（x-default 另加，指向英文） @type {readonly UrlLang[]} */
export const HREFLANGS = ['en', 'zh-TW'];

/**
 * 把 pathname 拆成語言與站內路徑。
 *   '/zh-TW'        → { lang: 'zh-TW', path: '/' }
 *   '/zh-TW/about'  → { lang: 'zh-TW', path: '/about' }
 *   '/about'        → { lang: null,    path: '/about' }
 *   '/zh-tw/x'      → { lang: 'zh-TW', path: '/x', redirect: '/zh-TW/x' }（大小寫不對：呼叫端 301 到 redirect）
 *   '/zh-TWx'       → { lang: null,    path: '/zh-TWx' }
 * @param {string} pathname
 * @returns {{ lang: 'zh-TW' | null, path: string, redirect?: string }}
 */
export function splitLangPath(pathname) {
    const m = /^\/([A-Za-z]{2}-[A-Za-z]{2})(?=\/|$)(.*)$/.exec(pathname || '/');
    if (m) {
        const lang = URL_LANGS.find((l) => l.toLowerCase() === m[1].toLowerCase());
        if (lang) {
            const path = m[2] || '/';
            return m[1] === lang
                ? { lang: /** @type {'zh-TW'} */ (lang), path }
                : { lang: /** @type {'zh-TW'} */ (lang), path, redirect: withLang(lang, path) };
        }
    }
    return { lang: null, path: pathname || '/' };
}

/**
 * 站內路徑加上語言前綴；英文不加、首頁不留尾斜線
 * @param {string | null | undefined} lang
 * @param {string} path
 * @returns {string}
 */
export function withLang(lang, path) {
    if (!lang || !URL_LANGS.includes(lang)) return path;
    return path === '/' ? `/${lang}` : `/${lang}${path}`;
}

/**
 * i18n 語言 → 網址語言：只有 zh-TW 有前綴，其他一律落在無前綴（'en'）
 * @param {string | undefined} i18nLang
 * @returns {UrlLang}
 */
export function urlLangOf(i18nLang) {
    return i18nLang && URL_LANGS.includes(i18nLang) ? /** @type {UrlLang} */ (i18nLang) : DEFAULT_LANG;
}

/**
 * 某站內路徑的 hreflang 清單（en、zh-TW、x-default＝en），給 head <link rel="alternate"> 與 sitemap xhtml:link
 * @param {string} origin
 * @param {string} path
 * @returns {Array<{ hreflang: string, href: string }>}
 */
export function alternates(origin, path) {
    const out = HREFLANGS.map((hreflang) => ({ hreflang, href: origin + withLang(hreflang, path) }));
    out.push({ hreflang: 'x-default', href: origin + withLang(DEFAULT_LANG, path) });
    return out;
}
