// sitemap 覆蓋率鎖：generate-sitemap.js 的 urls / ROUTE_SOURCES 是手寫清單，
// 漏列新路由不會有任何錯誤（ROUTE_SOURCES 缺項只會靜默退回 today lastmod）。
// 這裡實際跑一次產生器，比對 PAGE_PATHS（/admin 刻意不進 sitemap）。
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGE_PATHS } from '../../src/config/routes';

const rootDir = resolve(__dirname, '../..');
const SITE = 'https://multistreaming.org';
const EXCLUDED = new Set(['/admin']);

describe('sitemap.xml 覆蓋 PAGE_PATHS', () => {
    let xml = '';
    beforeAll(() => {
        execSync('node scripts/generate-sitemap.js', { cwd: rootDir, stdio: 'ignore' });
        xml = readFileSync(resolve(rootDir, 'sitemap.xml'), 'utf8');
    });

    it('每條可索引路由都在 sitemap 裡，且 /admin 不在', () => {
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
        for (const p of Object.values(PAGE_PATHS)) {
            if (EXCLUDED.has(p)) expect(locs).not.toContain(`${SITE}${p}`);
            else expect(locs).toContain(`${SITE}${p}`);
        }
        // 不多：sitemap 裡沒有 PAGE_PATHS 以外的路徑
        const known = new Set(Object.values(PAGE_PATHS).map((p) => `${SITE}${p}`));
        for (const loc of locs) expect(known.has(loc)).toBe(true);
    });

    it('每條 URL 都有 YYYY-MM-DD 的 lastmod', () => {
        const entries = [...xml.matchAll(/<url>(.*?)<\/url>/gs)].map((m) => m[1]);
        expect(entries.length).toBeGreaterThan(0);
        for (const e of entries) expect(e).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
    });
});
