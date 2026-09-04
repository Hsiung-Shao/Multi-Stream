// SSG 預渲染的安全網：
//   1. entry-server 真的能在 Node 把每條路由渲染成該頁內容（不是全部退回首頁、不是 Suspense fallback）
//   2. scripts/prerender.mjs 的輸出檔路徑 ↔ functions/[[path]].js 的取檔路徑一比一（兩邊各自手寫，會漂移）
//   3. applyHead 對殼做的改寫與 edge Function 同一組值（ROUTE_META 單一來源）
//   4. [[path]].js 的「優先取預渲染、失敗退回空殼」邏輯（文字層鎖，與 seoEdge.test.ts 同手法）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGE_PATHS } from '../../src/config/routes';
import { GUIDE_SLUGS, guidePath } from '../../src/config/guides';
import { render, PRERENDER_ROUTES, PRERENDER_LANGS, PRERENDER_THEME } from '../../src/entry-server';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { prerenderPathFor } from '../../functions/[[path]].js';
// @ts-expect-error scripts 目錄的 ESM JS 無型別宣告
import { applyHead, outRelFor } from '../../scripts/prerender.mjs';
// @ts-expect-error 同上
import { ROUTE_META, WEBAPP_JSONLD_ROUTES } from '../../functions/lib/seo-meta.js';

const rootDir = resolve(__dirname, '../..');
const h1Of = (html: string) => (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();

describe('entry-server：路由清單', () => {
    it('= PAGE_PATHS 減去 /canvas 與 /admin（含全部教學文章）', () => {
        const expected = Object.values(PAGE_PATHS).filter((p) => p !== '/canvas' && p !== '/admin').sort();
        expect([...PRERENDER_ROUTES].sort()).toEqual(expected);
        for (const s of GUIDE_SLUGS) expect(PRERENDER_ROUTES).toContain(guidePath(s));
        expect(PRERENDER_LANGS).toEqual(['zh-TW', 'en']);
        expect(PRERENDER_THEME).toBe('dark');
    });

    it('/canvas、/admin、未知路徑一律拒絕', async () => {
        await expect(render('/canvas', 'en')).rejects.toThrow();
        await expect(render('/admin', 'en')).rejects.toThrow();
        await expect(render('/nope', 'en')).rejects.toThrow();
    });
});

describe('entry-server：實際渲染（Node，無 DOM）', () => {
    it('/faq en 與 zh-TW 各自輸出該頁 H1 與頁面 JSON-LD，而不是首頁', async () => {
        const en = await render('/faq', 'en');
        const zh = await render('/faq', 'zh-TW');
        expect(h1Of(en)).toMatch(/FAQ/);
        expect(h1Of(zh)).toMatch(/常見問題/);
        expect(en).toContain('data-seo-jsonld');
        expect(en).not.toContain('Your Exclusive Streaming Dashboard');
        // Suspense fallback 文案不該留在產物裡（onAllReady 才輸出）
        expect(en).not.toMatch(/Loading\.\.\./);
        expect(zh).not.toMatch(/載入中/);
    }, 30_000);

    it('教學文章與首頁、比較頁、開發者頁各自有不同的 H1', async () => {
        const [home, share, compare, creator] = await Promise.all([
            render('/', 'en'),
            render(guidePath('share'), 'en'),
            render('/compare', 'en'),
            render('/about/creator', 'en'),
        ]);
        const h1s = [home, share, compare, creator].map(h1Of);
        expect(new Set(h1s).size).toBe(4);
        expect(h1s[1].toLowerCase()).toContain('share');
        // 首頁靠 LandingPage 自己的 FaqJsonLd；其餘頁面靠 <SEO jsonLd> 進 tree
        expect(home).toContain('application/ld+json');
        expect(compare).toContain('data-seo-jsonld');
    }, 60_000);
});

describe('prerender.mjs ↔ [[path]].js 取檔路徑', () => {
    it.each(PRERENDER_LANGS.flatMap((l) => PRERENDER_ROUTES.map((r) => [l, r] as const)))(
        '%s %s：Function 取檔路徑 + .html == 腳本輸出檔',
        (lang, route) => {
            expect(`${prerenderPathFor(lang, route)}.html`).toBe(`/${outRelFor(lang, route)}`);
        },
    );

    it('首頁不叫 index（Pages 會把 /dir/index 308 成 /dir/）', () => {
        expect(outRelFor('en', '/')).not.toMatch(/index\.html$/);
        expect(prerenderPathFor('en', '/')).not.toMatch(/\/index$/);
    });
});

describe('prerender.mjs applyHead', () => {
    // 用 repo 的 index.html 當殼（build 時 %SEO_*% 會被 vite 替換；這裡只驗改寫邏輯，佔位無妨）
    const shell = readFileSync(resolve(rootDir, 'index.html'), 'utf8');

    it('教學文章：lang / data-prerender-* / title / canonical / og:type=article / 移除 ld-webapp / 注入 #root', () => {
        const route = guidePath('canvas');
        const out = applyHead(shell, route, 'en', 'dark', '<main><h1>X</h1></main>');
        expect(out).toContain('<html lang="en" data-prerender-lang="en" data-prerender-theme="dark">');
        expect(out).toContain(`<title>${ROUTE_META[route].en.title.replace(/&/g, '&amp;')}</title>`);
        expect(out).toContain(`<link rel="canonical" href="https://multistreaming.org${route}"`);
        expect(out).toContain('property="og:type" content="article"');
        expect(out).toContain('property="og:locale" content="en_US"');
        expect(out).not.toContain('id="ld-webapp"');
        expect(out).toContain('<div id="root"><main><h1>X</h1></main></div>');
    });

    it('首頁保留 WebApplication JSON-LD、og:type=website、zh-TW locale', () => {
        expect(WEBAPP_JSONLD_ROUTES).toContain('/');
        const out = applyHead(shell, '/', 'zh-TW', 'dark', '<main><h1>X</h1></main>');
        expect(out).toContain('id="ld-webapp"');
        expect(out).toContain('property="og:type" content="website"');
        expect(out).toContain('property="og:locale" content="zh_TW"');
        expect(out).toContain('<link rel="canonical" href="https://multistreaming.org/"');
    });
});

describe('[[path]].js 取殼邏輯（文字層鎖）', () => {
    const edgeSrc = readFileSync(resolve(rootDir, 'functions/[[path]].js'), 'utf8');
    it('已知路由先取預渲染檔，非 200 退回空殼 index.html', () => {
        expect(edgeSrc).toContain('prerenderPathFor(lang, rawPath)');
        expect(edgeSrc).toContain("shell.status !== 200");
        expect(edgeSrc).toContain("env.ASSETS.fetch(new Request(url.origin + '/'))");
    });
});
