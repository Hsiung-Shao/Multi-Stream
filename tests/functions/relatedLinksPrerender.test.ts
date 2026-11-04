// 站內相關連結（RelatedLinks）與週表頁連到名錄：真的在 Node 預渲染頁面再看輸出 HTML（M11、M12）
import { describe, it, expect } from 'vitest';
import { guidePath } from '../../src/config/guides';
import { render } from '../../src/entry-server';

/** 取出 <nav aria-labelledby="related-links-h"> 的內容 */
const relatedNav = (html: string) => html.match(/<nav[^>]*aria-labelledby="related-links-h"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? null;
const hrefsIn = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

const ROUTES: Array<[string, string]> = [
    ['/songs', 'songs'],
    ['/status', 'status'],
    ['/compare', 'compare'],
    ['/about', 'about'],
    [guidePath('schedule'), 'instructions/schedule'],
];

describe('M11 RelatedLinks 出現在四個靜態頁與教學文章', () => {
    it.each(ROUTES)('M11 %s（zh-TW）：有 related-links-h 標題與 nav，且至少 3 個 /zh-TW 站內連結', async (route) => {
        const html = await render(route, 'zh-TW');
        expect(html).toContain('id="related-links-h"');
        const nav = relatedNav(html);
        expect(nav, `${route} 缺少 <nav aria-labelledby="related-links-h">`).not.toBeNull();
        const hrefs = hrefsIn(nav as string);
        expect(hrefs.filter((x) => x.startsWith('/zh-TW/')).length).toBeGreaterThanOrEqual(3);
        // 中文頁的相關連結不能跳回英文版
        expect(hrefs.filter((x) => !x.startsWith('/zh-TW')), `${route} 有未帶前綴的連結`).toEqual([]);
    }, 60_000);
});

describe('M12 週表頁的關於區塊連到名錄', () => {
    it('M12 /schedule（zh-TW）含 href="/zh-TW/vtubers"', async () => {
        const html = await render('/schedule', 'zh-TW');
        expect(html).toContain('href="/zh-TW/vtubers"');
    }, 60_000);

    it('M12 /schedule（en）含 href="/vtubers"', async () => {
        const html = await render('/schedule', 'en');
        expect(html).toContain('href="/vtubers"');
    }, 60_000);
});
