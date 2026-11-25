// 資料報告頁 /reports/taiwan-vtuber-streaming-hours：路由、快照自洽、edge meta、預渲染、sitemap 一次鎖住。
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGE_PATHS, pathToPage, pageToPath } from '../../src/config/routes';
import data from '../../src/data/reports/stream-hours-2026-11.json';
import { render } from '../../src/entry-server';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { ROUTE_META } from '../../functions/lib/seo-meta.js';

const ROUTE = '/reports/taiwan-vtuber-streaming-hours';
const rootDir = resolve(__dirname, '../..');
const SITE = 'https://multistreaming.org';
const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
const h1Of = (html: string) => (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();

type Meta = { title: string; description: string };
const meta = ROUTE_META as Record<string, { type?: string; noindex?: boolean; 'zh-TW': Meta; en: Meta }>;

describe('資料報告頁：路由', () => {
    it('R1 報告網址與頁面雙向互轉（英文與 /zh-TW）', () => {
        expect((PAGE_PATHS as Record<string, string>).reportStreamHours).toBe(ROUTE);
        expect(pathToPage(ROUTE)).toBe('reportStreamHours');
        expect(pathToPage(`/zh-TW${ROUTE}`)).toBe('reportStreamHours');
        expect(pageToPath('reportStreamHours' as never, 'en')).toBe(ROUTE);
        expect(pageToPath('reportStreamHours' as never, 'zh-TW')).toBe(`/zh-TW${ROUTE}`);
    });
});

describe('資料報告頁：快照資料', () => {
    it('R2 快照資料自洽：各分佈加總皆等於 totalStreams', () => {
        expect(data.byHour).toHaveLength(24);
        expect(sum(data.byHour)).toBe(data.totalStreams);
        expect(data.byDowHour).toHaveLength(7);
        for (const row of data.byDowHour) expect(row).toHaveLength(24);
        expect(sum(data.byDowHour.flat())).toBe(data.totalStreams);
        expect(data.durationBins).toHaveLength(7);
        expect(sum(data.durationBins)).toBe(data.totalStreams);
    });
});

describe('資料報告頁：edge meta', () => {
    it('R3 為 article、可索引，兩語標題都含 VTuber', () => {
        const m = meta[ROUTE];
        expect(m).toBeDefined();
        expect(m?.type).toBe('article');
        expect(m?.noindex).not.toBe(true);
        expect(m?.en.title).toMatch(/VTuber/);
        expect(m?.['zh-TW'].title).toMatch(/VTuber/);
    });
});

describe('資料報告頁：預渲染', () => {
    it('R4 兩語都有獨立 h1、真實總數千分位、最高峰整點與表格', async () => {
        const peak = data.byHour.indexOf(Math.max(...data.byHour));
        const peakLabel = `${String(peak).padStart(2, '0')}:00`;
        const total = data.totalStreams.toLocaleString('en-US');
        const home = h1Of(await render('/', 'en'));
        for (const lang of ['en', 'zh-TW'] as const) {
            const html = await render(ROUTE, lang);
            const h1 = h1Of(html);
            expect(h1).not.toBe('');
            expect(h1).not.toBe(home);
            expect(html).toContain(total);
            expect(html).toContain(peakLabel);
            expect(html).toContain('<table');
        }
    }, 60_000);
});

describe('資料報告頁：sitemap', () => {
    let xml = '';
    beforeAll(() => {
        execSync('node scripts/generate-sitemap.js', { cwd: rootDir, stdio: 'ignore' });
        xml = readFileSync(resolve(rootDir, 'sitemap.xml'), 'utf8');
    }, 60_000);

    it('R5 英文與 /zh-TW 兩個網址都在 sitemap', () => {
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
        expect(locs).toContain(`${SITE}${ROUTE}`);
        expect(locs).toContain(`${SITE}/zh-TW${ROUTE}`);
    });
});
