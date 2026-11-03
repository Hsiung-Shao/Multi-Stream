// 語言前綴網址（/zh-TW/...）的 edge／預渲染／sitemap 端：locale.js 純函式、catch-all 的 200／301／hreflang、
// 預渲染 canonical、靜態與個人頁 sitemap。L 編號對應計畫的測試規格表（前端部分在 tests/i18n/langRouting.test.tsx）。
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGE_PATHS } from '../../src/config/routes';
import { parseShare } from '../../src/utils/shareLink';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequest } from '../../functions/[[path]].js';
// @ts-expect-error scripts 目錄的 ESM JS 無型別宣告
import { applyHead } from '../../scripts/prerender.mjs';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { buildScheduleSitemap } from '../../functions/sitemap-schedule.xml.js';
// @ts-expect-error 同上
import { renderPersonBodyHtml } from '../../functions/lib/schedule-person.js';

// locale.js 還不存在時用動態載入，讓只依賴它的 it 各自失敗，不拖垮整檔
const LOCALE_MODULE = '../../functions/lib/locale.js';
const loadLocale = () => import(/* @vite-ignore */ LOCALE_MODULE);

const rootDir = resolve(__dirname, '../..');
const SITE = 'https://multistreaming.org';

describe('locale.js 純函式', () => {
    it('L1 前綴網址拆成語言與路徑：五種輸入各回預期的 lang／path／redirect', async () => {
        const { splitLangPath } = await loadLocale();
        expect(splitLangPath('/zh-TW')).toEqual({ lang: 'zh-TW', path: '/' });
        expect(splitLangPath('/zh-TW/about')).toEqual({ lang: 'zh-TW', path: '/about' });
        expect(splitLangPath('/about')).toEqual({ lang: null, path: '/about' });
        expect(splitLangPath('/zh-tw/x')).toEqual({ lang: 'zh-TW', path: '/x', redirect: '/zh-TW/x' });
        expect(splitLangPath('/zh-TWx')).toEqual({ lang: null, path: '/zh-TWx' });
    });

    it('L2 withLang／urlLangOf／alternates：英文不加前綴、首頁不留尾斜線、alternates 三筆含 x-default', async () => {
        const { withLang, urlLangOf, alternates, DEFAULT_LANG, URL_LANGS, HREFLANGS } = await loadLocale();
        expect(DEFAULT_LANG).toBe('en');
        expect(URL_LANGS).toEqual(['zh-TW']);
        expect(HREFLANGS).toEqual(['en', 'zh-TW']);
        expect(withLang('zh-TW', '/')).toBe('/zh-TW');
        expect(withLang('zh-TW', '/about')).toBe('/zh-TW/about');
        expect(withLang('en', '/about')).toBe('/about');
        expect(withLang('en', '/')).toBe('/');
        expect(urlLangOf('zh-TW')).toBe('zh-TW');
        for (const l of ['en', 'ja', 'ko', 'zh-CN', undefined]) expect(urlLangOf(l)).toBe('en');
        expect(alternates(SITE, '/about')).toEqual([
            { hreflang: 'en', href: `${SITE}/about` },
            { hreflang: 'zh-TW', href: `${SITE}/zh-TW/about` },
            { hreflang: 'x-default', href: `${SITE}/about` },
        ]);
        expect(alternates(SITE, '/')).toEqual([
            { hreflang: 'en', href: `${SITE}/` },
            { hreflang: 'zh-TW', href: `${SITE}/zh-TW` },
            { hreflang: 'x-default', href: `${SITE}/` },
        ]);
    });
});

// ── edge catch-all ───────────────────────────────────────────────────────────

// 最小殼：只放 catch-all 會改寫的標籤；刻意不含任何 rel="alternate"（L11 要證明 noindex 頁不輸出）
const SHELL = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8" /><title>x</title>
<meta name="title" content="x" /><meta name="description" content="x" /><meta name="robots" content="index, follow" />
<link rel="canonical" href="https://multistreaming.org/" />
<meta property="og:type" content="website" /><meta property="og:url" content="https://multistreaming.org/" />
<meta property="og:title" content="x" /><meta property="og:description" content="x" /><meta property="og:locale" content="zh_TW" />
<meta name="twitter:title" content="x" /><meta name="twitter:description" content="x" /><meta name="twitter:url" content="https://multistreaming.org/" />
<script type="application/ld+json" id="ld-webapp">{}</script></head><body><div id="root"></div></body></html>`;

/** Workers 的 HTMLRewriter 在 Node 不存在：用 jsdom 的 DOMParser 做最小替身（逐規則套用 element handler） */
class FakeHTMLRewriter {
    private rules: Array<[string, { element?: (el: unknown) => void }]> = [];
    on(selector: string, handler: { element?: (el: unknown) => void }) {
        this.rules.push([selector, handler]);
        return this;
    }
    transform(res: Response) {
        const rules = this.rules;
        const body = new ReadableStream<Uint8Array>({
            async start(controller) {
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                for (const [selector, handler] of rules) {
                    doc.querySelectorAll(selector).forEach((node) => {
                        handler.element?.({
                            setAttribute: (k: string, v: string) => node.setAttribute(k, v),
                            getAttribute: (k: string) => node.getAttribute(k),
                            remove: () => node.remove(),
                            setInnerContent: (c: string, o?: { html?: boolean }) => {
                                if (o?.html) node.innerHTML = c;
                                else node.textContent = c;
                            },
                            append: (c: string, o?: { html?: boolean }) => {
                                if (o?.html) node.insertAdjacentHTML('beforeend', c);
                                else node.append(c);
                            },
                        });
                    });
                }
                controller.enqueue(new TextEncoder().encode('<!DOCTYPE html>' + doc.documentElement.outerHTML));
                controller.close();
            },
        });
        return new Response(body, { status: res.status, headers: res.headers });
    }
}

async function callEdge(path: string, headers: Record<string, string> = {}) {
    const fetched: string[] = [];
    const env = {
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_ANON_KEY: 'anon-test',
        ASSETS: {
            fetch: vi.fn(async (req: Request) => {
                fetched.push(new URL(req.url).pathname);
                return new Response(SHELL, { status: 200, headers: { 'content-type': 'text/html' } });
            }),
        },
    };
    const request = new Request(`${SITE}${path}`, { headers });
    const res: Response = await onRequest({ request, env, next: vi.fn() });
    const text = res.status === 301 ? '' : await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const alternates: Record<string, string> = {};
    doc.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => {
        alternates[l.getAttribute('hreflang') as string] = l.getAttribute('href') as string;
    });
    return {
        res,
        text,
        fetched,
        lang: doc.documentElement.getAttribute('lang'),
        title: doc.title,
        canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
        ogUrl: doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null,
        alternates,
        alternateCount: doc.querySelectorAll('link[rel="alternate"]').length,
    };
}

describe('catch-all：語言前綴網址', () => {
    beforeAll(() => {
        vi.stubGlobal('HTMLRewriter', FakeHTMLRewriter);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.stubGlobal('HTMLRewriter', FakeHTMLRewriter);
    });

    it('L7 /zh-TW/about：200、lang=zh-TW、canonical 與 og:url 自指、三個 hreflang、取 /_prerender/zh-TW/about', async () => {
        const r = await callEdge('/zh-TW/about');
        expect(r.res.status).toBe(200);
        expect(r.lang).toBe('zh-TW');
        expect(r.canonical).toBe(`${SITE}/zh-TW/about`);
        expect(r.ogUrl).toBe(`${SITE}/zh-TW/about`);
        expect(r.alternates).toEqual({
            en: `${SITE}/about`,
            'zh-TW': `${SITE}/zh-TW/about`,
            'x-default': `${SITE}/about`,
        });
        expect(r.fetched).toContain('/_prerender/zh-TW/about');
    });

    it('L8 無 Accept-Language 的 /：lang=en、canonical 為英文首頁、回應不帶 Vary', async () => {
        const r = await callEdge('/');
        expect(r.res.status).toBe(200);
        expect(r.lang).toBe('en');
        expect(r.canonical).toBe(`${SITE}/`);
        expect(r.res.headers.has('Vary')).toBe(false);
    });

    it('L9 /zh-tw/about（小寫）：301 到 /zh-TW/about', async () => {
        const r = await callEdge('/zh-tw/about');
        expect(r.res.status).toBe(301);
        expect(r.res.headers.get('Location')).toBe(`${SITE}/zh-TW/about`);
    });

    it('L10 /zh-TW/schedule/<slug> 查到：中文標題、自指 canonical、hreflang 兩語加 x-default', async () => {
        const row = {
            name: '台一', img_url: null, schedule_indexable: true, youtube_channel_id: null, twitch_channel_id: null,
            active: [], recent: [], recent_count: [{ count: 0 }],
        };
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([row]), { status: 200, headers: { 'content-type': 'application/json' } })));
        const r = await callEdge('/zh-TW/schedule/taione');
        expect(r.res.status).toBe(200);
        expect(r.lang).toBe('zh-TW');
        expect(r.title).toContain('開台時間與直播週表');
        expect(r.canonical).toBe(`${SITE}/zh-TW/schedule/taione`);
        expect(r.alternates).toEqual({
            en: `${SITE}/schedule/taione`,
            'zh-TW': `${SITE}/zh-TW/schedule/taione`,
            'x-default': `${SITE}/schedule/taione`,
        });
    });

    it('L10b 個人頁內文麵包屑：zh-TW 三個 href 帶前綴，en 維持原樣', () => {
        const person = { name: '台一', youtube: null, twitch: null, streams: null };
        const zh = renderPersonBodyHtml('zh-TW', person, 'abc');
        expect(zh).toContain('href="/zh-TW"');
        expect(zh).toContain('href="/zh-TW/schedule"');
        expect(zh).toContain('href="/zh-TW/schedule/abc"');
        expect(zh).not.toContain('href="/schedule"');
        const en = renderPersonBodyHtml('en', person, 'abc');
        expect(en).toContain('href="/"');
        expect(en).toContain('href="/schedule"');
        expect(en).toContain('href="/schedule/abc"');
        expect(en).not.toContain('/zh-TW');
    });

    it('L11 noindex 頁（/zh-TW/admin）與 404（/zh-TW/nope）不輸出 hreflang，且沒有 canonical', async () => {
        const admin = await callEdge('/zh-TW/admin');
        expect(admin.res.status).toBe(200);
        expect(admin.alternateCount).toBe(0);
        expect(admin.text).not.toContain('rel="alternate"');
        const nope = await callEdge('/zh-TW/nope');
        expect(nope.res.status).toBe(404);
        expect(nope.alternateCount).toBe(0);
        expect(nope.text).not.toContain('rel="alternate"');
        expect(nope.canonical).toBeNull();
    });
});

// ── 預渲染 ───────────────────────────────────────────────────────────────────

describe('prerender.mjs applyHead：canonical 依語言加前綴', () => {
    const shell = readFileSync(resolve(rootDir, 'index.html'), 'utf8');

    it('L12 /faq 的 zh-TW 輸出 /zh-TW/faq，en 維持 /faq', () => {
        const canonicalOf = (html: string) => html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
        const zh = applyHead(shell, '/faq', 'zh-TW', 'dark', '<main></main>');
        expect(canonicalOf(zh)).toBe(`${SITE}/zh-TW/faq`);
        const en = applyHead(shell, '/faq', 'en', 'dark', '<main></main>');
        expect(canonicalOf(en)).toBe(`${SITE}/faq`);
    });
});

// ── sitemap ──────────────────────────────────────────────────────────────────

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;

/** 把 sitemap 拆成每個 <url> 的 { loc, links: {hreflang: href} } */
function parseUrls(xml: string) {
    return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
        const body = m[1];
        const links: Record<string, string> = {};
        const tags = body.match(/<xhtml:link\b[^>]*>/g) ?? [];
        for (const t of tags) {
            expect(attr(t, 'rel')).toBe('alternate');
            links[attr(t, 'hreflang') as string] = attr(t, 'href') as string;
        }
        return { loc: body.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '', linkCount: tags.length, links };
    });
}

describe('sitemap', () => {
    const EXCLUDED = new Set(['/admin', '/canvas', '/schedule/submit', '/songs/submit']);
    let xml = '';
    beforeAll(() => {
        execSync('node scripts/generate-sitemap.js', { cwd: rootDir, stdio: 'ignore' });
        xml = readFileSync(resolve(rootDir, 'sitemap.xml'), 'utf8');
    }, 60_000);

    it('L13 靜態 sitemap：每條路由有 en 與 /zh-TW 兩筆 loc，各帶 en／zh-TW／x-default 三個 xhtml:link', () => {
        const entries = parseUrls(xml);
        const byLoc = new Map(entries.map((e) => [e.loc, e]));
        for (const p of Object.values(PAGE_PATHS)) {
            const en = `${SITE}${p}`;
            const zh = p === '/' ? `${SITE}/zh-TW` : `${SITE}/zh-TW${p}`;
            if (EXCLUDED.has(p)) {
                expect(byLoc.has(en), en).toBe(false);
                expect(byLoc.has(zh), zh).toBe(false);
                continue;
            }
            for (const loc of [en, zh]) {
                const e = byLoc.get(loc);
                expect(e, loc).toBeDefined();
                expect(e?.linkCount, loc).toBe(3);
                expect(e?.links, loc).toEqual({ en, 'zh-TW': zh, 'x-default': en });
            }
        }
        expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    });

    it('L14 個人頁 sitemap：一個 slug 兩筆 url、根元素宣告 xhtml、x-default 指英文', () => {
        const out = buildScheduleSitemap([{ slug: 'abc', last_live_at: '2026-10-01T00:00:00Z' }]);
        expect(out).toMatch(/<urlset[^>]*xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
        const entries = parseUrls(out);
        expect(entries.map((e) => e.loc).sort()).toEqual([`${SITE}/schedule/abc`, `${SITE}/zh-TW/schedule/abc`].sort());
        for (const e of entries) {
            expect(e.linkCount, e.loc).toBe(3);
            expect(e.links, e.loc).toEqual({
                en: `${SITE}/schedule/abc`,
                'zh-TW': `${SITE}/zh-TW/schedule/abc`,
                'x-default': `${SITE}/schedule/abc`,
            });
        }
    });
});

// ── 分享連結 ─────────────────────────────────────────────────────────────────

describe('分享連結在前綴網址可用', () => {
    // App.tsx 的 INITIAL_SHARE 在模組載入時判斷路徑並 parseShare(search)；App 整體太重，這裡測它的最小組合
    it('L16 /zh-TW/canvas?streams=… 拆出 /canvas 且 query 仍可解析', async () => {
        const { splitLangPath } = await loadLocale();
        const u = new URL(`${SITE}/zh-TW/canvas?streams=tw:abc,yt:Vid_01&chat=1`);
        expect(splitLangPath(u.pathname).path).toBe(PAGE_PATHS.canvas);
        expect(parseShare(u.search)).toEqual({
            streams: [{ platform: 'twitch', id: 'abc' }, { platform: 'youtube', id: 'Vid_01' }],
            chat: true,
        });
    });

    // App 無法在測試裡整個 render：以文字鎖確認啟動時不再把網址換成「無前綴」的 /canvas、/songs（會把語言前綴吃掉）
    it('L16b App.tsx 不再用 replaceState 把前綴網址換回無前綴的 /canvas 或 /songs', () => {
        const src = readFileSync(resolve(rootDir, 'src/App.tsx'), 'utf8');
        expect(src.includes("window.history.replaceState(null, '', PAGE_PATHS.canvas)"), 'canvas 分享連結換網址').toBe(false);
        expect(src.includes("window.history.replaceState(null, '', PAGE_PATHS.songs)"), 'songs 分享連結換網址').toBe(false);
    });
});
