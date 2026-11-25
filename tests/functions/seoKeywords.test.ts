// 2026-11 中英文 SEO 第一批：鎖住依 GSC 查詢選定的目標字，避免之後改文案時被拿掉。
// 新教學的 sitemap／edge meta／預渲染 H1 由 sitemap、seoEdge、prerender 測試對 GUIDE_SLUGS 逐一驗證。
import { describe, it, expect } from 'vitest';
import { GUIDE_SLUGS } from '../../src/config/guides';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { ROUTE_META } from '../../functions/lib/seo-meta.js';

type Meta = { title: string; description: string };
const meta = ROUTE_META as Record<string, { 'zh-TW': Meta; en: Meta }>;

describe('中英文 SEO 目標字', () => {
    it('S1 YouTube 多開教學列入教學清單（帶動 sitemap、edge、預渲染的逐篇檢查）', () => {
        expect(GUIDE_SLUGS).toContain('watch-multiple-youtube-streams');
    });

    it('S2 YouTube 多開教學標題兩語都含 YouTube', () => {
        const m = meta['/instructions/watch-multiple-youtube-streams'];
        expect(m).toBeDefined();
        expect(m?.en.title).toMatch(/YouTube/);
        expect(m?.['zh-TW'].title).toMatch(/YouTube/);
    });

    it('S4 英文首頁描述含 multiview；Twitch 教學英文標題含 Multiview', () => {
        expect(meta['/'].en.description).toMatch(/multiview/i);
        expect(meta['/instructions/watch-multiple-twitch-streams'].en.title).toMatch(/Multiview/);
    });

    it('S4 繁中首頁標題含「多視窗」、描述含「多開」', () => {
        expect(meta['/']['zh-TW'].title).toContain('多視窗');
        expect(meta['/']['zh-TW'].description).toContain('多開');
    });
});
