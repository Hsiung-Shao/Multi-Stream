// 手機寬度的整頁清單鎖：每個有固定網址的頁面（扣首頁與畫布）都要走整頁版面，
// 否則新頁面在手機上會被導去 MobileApp（畫布）——/vtubers 曾漏掉（review 第 1 輪 bug）。
import { describe, it, expect } from 'vitest';
import { MOBILE_FULL_PAGES } from '../../src/App';
import { PAGE_PATHS } from '../../src/config/routes';

describe('MOBILE_FULL_PAGES', () => {
    it('PAGE_PATHS 的每個頁面（扣 home／canvas）都在整頁清單裡，含 vtubers 與 not-found', () => {
        for (const page of Object.keys(PAGE_PATHS)) {
            if (page === 'home' || page === 'canvas') expect(MOBILE_FULL_PAGES).not.toContain(page);
            else expect(MOBILE_FULL_PAGES, page).toContain(page);
        }
        expect(MOBILE_FULL_PAGES).toContain('vtubers');
        expect(MOBILE_FULL_PAGES).toContain('not-found');
    });
});
