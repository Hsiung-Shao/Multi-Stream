// Edge SEO 的「防漂移」測試：
// functions/ 無法 import src/ 的 TS 檔，所以 seo-meta.js / security-headers.js 是複本；
// 這裡把複本與單一來源（locale seo.ts、_headers、PAGE_PATHS）逐值比對，改一邊沒改另一邊會紅。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { ROUTE_META, NOT_FOUND_META, ROBOTS_INDEX, ROBOTS_NOINDEX, WEBAPP_JSONLD_ROUTES } from '../../functions/lib/seo-meta.js';
// @ts-expect-error 同上
import { HTML_SECURITY_HEADERS } from '../../functions/lib/security-headers.js';
import zhTWSeo from '../../src/i18n/locales/zh-TW/seo';
import enSeo from '../../src/i18n/locales/en/seo';
import zhTWFaq from '../../src/i18n/locales/zh-TW/faq';
import enFaq from '../../src/i18n/locales/en/faq';
import { PAGE_PATHS } from '../../src/config/routes';
import { GUIDE_SLUGS, guidePath } from '../../src/config/guides';
import { SEO_ROBOTS_INDEX, SEO_ROBOTS_NOINDEX } from '../../src/seo/defaults';
import { ORG_ID, SITE_ID, APP_ID } from '../../src/seo/jsonld';

const rootDir = resolve(__dirname, '../..');

type Meta = { title: string; description: string };
type RouteEntry = { 'zh-TW': Meta; en: Meta; noindex?: boolean; type?: 'article' };
const routeMeta = ROUTE_META as Record<string, RouteEntry>;

// locale seo.ts 的 key 前綴 ↔ edge 路由（教學文章 7 篇由 GUIDE_SLUGS 展開）
const SEO_NS_ROUTES: Record<string, string> = {
    '/': 'home',
    '/canvas': 'canvas',
    '/about': 'about',
    '/instructions': 'instructions',
    '/privacy': 'privacy',
    '/support': 'support',
    '/about/creator': 'creator',
    ...Object.fromEntries(GUIDE_SLUGS.map((s) => [guidePath(s), `instructions.${s}`])),
};

describe('edge seo-meta ↔ i18n locale 同步', () => {
    it.each(Object.entries(SEO_NS_ROUTES))('%s 與 seo:%s.* 一致（zh-TW / en）', (route, prefix) => {
        const zh = zhTWSeo as Record<string, string>;
        const en = enSeo as Record<string, string>;
        expect(routeMeta[route]['zh-TW'].title).toBe(zh[`${prefix}.title`]);
        expect(routeMeta[route]['zh-TW'].description).toBe(zh[`${prefix}.description`]);
        expect(routeMeta[route].en.title).toBe(en[`${prefix}.title`]);
        expect(routeMeta[route].en.description).toBe(en[`${prefix}.description`]);
    });

    it('/faq 與 faq ns 的 title/header_subtitle 一致', () => {
        const zh = zhTWFaq as Record<string, string>;
        const en = enFaq as Record<string, string>;
        expect(routeMeta['/faq']['zh-TW'].title).toBe(`${zh['title']} - MultiStream Hub`);
        expect(routeMeta['/faq']['zh-TW'].description).toBe(zh['header_subtitle']);
        expect(routeMeta['/faq'].en.title).toBe(`${en['title']} - MultiStream Hub`);
        expect(routeMeta['/faq'].en.description).toBe(en['header_subtitle']);
    });

    it('ROUTE_META 覆蓋 PAGE_PATHS 的全部路由（不多不少）', () => {
        const expected = Object.values(PAGE_PATHS).sort();
        expect(Object.keys(routeMeta).sort()).toEqual(expected);
    });

    it('教學文章路由全部標 type: article，且只有它們是 article', () => {
        const articleRoutes = Object.entries(routeMeta)
            .filter(([, v]) => v.type === 'article')
            .map(([k]) => k)
            .sort();
        expect(articleRoutes).toEqual(GUIDE_SLUGS.map(guidePath).sort());
    });

    it('/admin 標記 noindex；404 meta 兩語言齊備', () => {
        expect(routeMeta['/admin'].noindex).toBe(true);
        expect((NOT_FOUND_META as Record<string, Meta>)['zh-TW'].title).toContain('MultiStream Hub');
        expect((NOT_FOUND_META as Record<string, Meta>).en.title).toContain('MultiStream Hub');
    });

    it('robots 常數與 src/seo/defaults.ts 一致', () => {
        expect(ROBOTS_INDEX).toBe(SEO_ROBOTS_INDEX);
        expect(ROBOTS_NOINDEX).toBe(SEO_ROBOTS_NOINDEX);
    });
});

describe('edge JSON-LD 處理（WebApplication 只留 / 與 /canvas）', () => {
    const indexHtml = readFileSync(resolve(rootDir, 'index.html'), 'utf8');
    const edgeSrc = readFileSync(resolve(rootDir, 'functions/[[path]].js'), 'utf8');

    it('WEBAPP_JSONLD_ROUTES 都是已知路由且含首頁', () => {
        const routes = WEBAPP_JSONLD_ROUTES as string[];
        expect(routes).toContain('/');
        for (const r of routes) expect(Object.values(PAGE_PATHS)).toContain(r);
    });

    it('index.html 的 WebApplication 帶 id="ld-webapp"，三段 JSON-LD 都有可被引用的 @id', () => {
        expect(indexHtml).toContain('<script type="application/ld+json" id="ld-webapp">');
        for (const id of ['#webapp', '#website', '#organization']) {
            expect(indexHtml).toContain(`"@id": "https://multistreaming.org/${id}"`);
        }
        // 前端 jsonld.ts 引用的 @id 必須與 index.html 一致
        expect(ORG_ID).toBe('https://multistreaming.org/#organization');
        expect(SITE_ID).toBe('https://multistreaming.org/#website');
        expect(APP_ID).toBe('https://multistreaming.org/#webapp');
    });

    it('[[path]].js 有移除 script#ld-webapp 與改寫 og:type 的邏輯（文字層鎖）', () => {
        expect(edgeSrc).toContain("rewriter.on('script#ld-webapp'");
        expect(edgeSrc).toContain('WEBAPP_JSONLD_ROUTES.includes(rawPath)');
        expect(edgeSrc).toContain(`meta[property="og:type"]`);
    });
});

describe('edge security-headers ↔ _headers /* 區塊同步', () => {
    it('五個標頭逐值相等', () => {
        const lines = readFileSync(resolve(rootDir, '_headers'), 'utf8').split(/\r?\n/);
        const block: Record<string, string> = {};
        let inStar = false;
        for (const ln of lines) {
            if (ln.trim().startsWith('#')) continue;
            if (!ln.startsWith(' ') && ln.trim()) {
                inStar = ln.trim() === '/*';
                continue;
            }
            if (inStar && ln.startsWith('  ') && ln.includes(':')) {
                const idx = ln.indexOf(':');
                block[ln.slice(0, idx).trim()] = ln.slice(idx + 1).trim();
            }
        }
        expect(HTML_SECURITY_HEADERS).toEqual(block);
    });
});
