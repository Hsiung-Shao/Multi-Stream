// 個人週表頁的 edge 端：/schedule/<slug> 解析、文案與前端同步、catch-all 的 200／301／404、動態 sitemap
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { resolveSchedulePerson, anonSelect, schedulePersonMeta, largerAvatar as edgeLargerAvatar, SCHEDULE_PERSON_SEO, SCHEDULE_SLUG_RE as EDGE_SLUG_RE } from '../../functions/lib/schedule-person.js';
// @ts-expect-error 同上
import { buildScheduleSitemap } from '../../functions/sitemap-schedule.xml.js';
import { SCHEDULE_SLUG_RE } from '../../src/config/schedulePerson';
import { largerAvatar } from '../../src/features/schedule/streamLinks';
import zhTWSchedule from '../../src/i18n/locales/zh-TW/schedule';
import enSchedule from '../../src/i18n/locales/en/schedule';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-test' };
const ok = (data: unknown) => vi.fn(async () => ({ ok: true, status: 200, data, error: null }));

describe('schedule-person：與前端同一套規則', () => {
    it('slug 規則與 src/config/schedulePerson.ts 相同', () => {
        expect(EDGE_SLUG_RE.source).toBe(SCHEDULE_SLUG_RE.source);
    });

    it('title／description 模板與 i18n person.seo.* 一致（zh-TW／en）', () => {
        const zh = zhTWSchedule as Record<string, string>;
        const en = enSchedule as Record<string, string>;
        expect(SCHEDULE_PERSON_SEO['zh-TW'].title).toBe(zh['person.seo.title']);
        expect(SCHEDULE_PERSON_SEO['zh-TW'].description).toBe(zh['person.seo.description']);
        expect(SCHEDULE_PERSON_SEO.en.title).toBe(en['person.seo.title']);
        expect(SCHEDULE_PERSON_SEO.en.description).toBe(en['person.seo.description']);
    });

    it('largerAvatar：YouTube 頭像改 400px，其他來源不動；前後端結果相同', () => {
        const cases = [
            'https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj',
            'https://yt3.googleusercontent.com/xyz=s176-c-k',
            'https://static-cdn.jtvnw.net/jtv_user_pictures/a-profile_image-300x300.png',
        ];
        expect(largerAvatar(cases[0])).toBe('https://yt3.ggpht.com/abc=s400-c-k-c0x00ffffff-no-rj');
        expect(largerAvatar(cases[2])).toBe(cases[2]);
        for (const c of cases) expect(edgeLargerAvatar(c)).toBe(largerAvatar(c));
    });

    it('schedulePersonMeta 代入名字；未知語言退回 en', () => {
        expect(schedulePersonMeta('zh-TW', '台一').title).toBe('台一 開台時間與直播週表 - MultiStream Hub');
        expect(schedulePersonMeta('xx', 'A').title).toBe('A stream schedule and live times - MultiStream Hub');
    });
});

describe('resolveSchedulePerson', () => {
    it('不是個人頁網址 → none，不查資料庫', async () => {
        const selectFn = ok([]);
        expect(await resolveSchedulePerson(env, '/schedule', selectFn)).toEqual({ kind: 'none' });
        expect(await resolveSchedulePerson(env, '/schedule/a/b', selectFn)).toEqual({ kind: 'none' });
        expect(selectFn).not.toHaveBeenCalled();
    });

    it('大寫 → 301 到小寫；不合規則或編碼壞掉 → notfound', async () => {
        const selectFn = ok([]);
        expect(await resolveSchedulePerson(env, '/schedule/TaiOne', selectFn)).toEqual({ kind: 'redirect', location: '/schedule/taione' });
        expect(await resolveSchedulePerson(env, '/schedule/%E4%B8%AD%E6%96%87', selectFn)).toEqual({ kind: 'notfound' });
        expect(await resolveSchedulePerson(env, '/schedule/%E0%A4%A', selectFn)).toEqual({ kind: 'notfound' });
        expect(selectFn).not.toHaveBeenCalled();
    });

    it('查到 → found（只收 https 頭像）；查無 → notfound', async () => {
        const found = ok([{ name: '台一', img_url: 'https://yt3.ggpht.com/a=s88-c', schedule_indexable: false }]);
        expect(await resolveSchedulePerson(env, '/schedule/taione', found)).toEqual({ kind: 'found', name: '台一', image: 'https://yt3.ggpht.com/a=s400-c', indexable: false });
        expect(found.mock.calls[0][1]).toBe('vtubers?select=name,img_url,schedule_indexable&slug=eq.taione&limit=1');
        const insecure = ok([{ name: 'B', img_url: 'http://x/a.png', schedule_indexable: true }]);
        expect(await resolveSchedulePerson(env, '/schedule/bbb', insecure)).toMatchObject({ image: null, indexable: true });
        expect(await resolveSchedulePerson(env, '/schedule/nobody', ok([]))).toEqual({ kind: 'notfound' });
    });

    it('資料庫失敗、逾時或未設定 → error（呼叫端照常回 SPA 殼，不回 404）', async () => {
        const failing = vi.fn(async () => ({ ok: false, status: 500, data: null, error: 'x' }));
        expect(await resolveSchedulePerson(env, '/schedule/taione', failing)).toEqual({ kind: 'error' });
        expect(await anonSelect({}, 'vtubers')).toEqual({ ok: false, data: null });
    });

    it('百分比編碼的網址 301 到正規網址（canonical 只有一個）', async () => {
        const selectFn = ok([]);
        expect(await resolveSchedulePerson(env, '/schedule/%61bc', selectFn)).toEqual({ kind: 'redirect', location: '/schedule/abc' });
        expect(selectFn).not.toHaveBeenCalled();
    });

    it('edge 快取：found／notfound 放進快取，第二次不再查資料庫；error 不快取', async () => {
        const store = new Map<string, Response>();
        const cache = {
            match: async (req: Request) => store.get(req.url)?.clone() ?? undefined,
            put: async (req: Request, res: Response) => { store.set(req.url, res); },
        };
        const found = ok([{ name: '台一', img_url: null, schedule_indexable: true }]);
        const first = await resolveSchedulePerson(env, '/schedule/taione', found, cache);
        const second = await resolveSchedulePerson(env, '/schedule/taione', found, cache);
        expect(second).toEqual(first);
        expect(found).toHaveBeenCalledTimes(1);
        const failing = vi.fn(async () => ({ ok: false, data: null }));
        await resolveSchedulePerson(env, '/schedule/other', failing, cache);
        expect([...store.keys()].some((k) => k.endsWith('/other'))).toBe(false);
    });
});

describe('catch-all 接線', () => {
    const src = readFileSync(resolve(__dirname, '../../functions/[[path]].js'), 'utf8');
    it('個人頁查詢只在白名單沒命中時才做（已知路由不多打資料庫）', () => {
        expect(src).toMatch(/const person = entry \? \{ kind: 'none' \} : await resolveSchedulePerson\(env, rawPath\);/);
    });
    it('robots.txt 同時列出靜態與個人頁 sitemap', () => {
        const robots = readFileSync(resolve(__dirname, '../../robots.txt'), 'utf8');
        expect(robots).toContain('Sitemap: https://multistreaming.org/sitemap.xml');
        expect(robots).toContain('Sitemap: https://multistreaming.org/sitemap-schedule.xml');
    });
});

describe('buildScheduleSitemap', () => {
    it('列出合規 slug，lastmod 取日期；不合規的略過', () => {
        const xml = buildScheduleSitemap([
            { slug: 'taione', last_live_at: '2026-09-28T12:00:00Z' },
            { slug: 'nolive', last_live_at: null },
            { slug: 'Bad<slug>', last_live_at: null },
        ]);
        expect(xml).toContain('<url><loc>https://multistreaming.org/schedule/taione</loc><lastmod>2026-09-28</lastmod></url>');
        expect(xml).toContain('<url><loc>https://multistreaming.org/schedule/nolive</loc></url>');
        expect(xml).not.toContain('Bad');
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    });
});
