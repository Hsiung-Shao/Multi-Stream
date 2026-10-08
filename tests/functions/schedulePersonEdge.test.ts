// 個人週表頁的 edge 端：/schedule/<slug> 解析、文案與前端同步、catch-all 的 200／301／404、動態 sitemap
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import {
    resolveSchedulePerson,
    anonSelect,
    schedulePersonMeta,
    largerAvatar as edgeLargerAvatar,
    SCHEDULE_PERSON_SEO,
    SCHEDULE_PERSON_BODY,
    SCHEDULE_SLUG_RE as EDGE_SLUG_RE,
    personQuery,
    personStreamsFromRow,
    renderPersonBodyHtml,
    PERSON_RECENT_DAYS as EDGE_RECENT_DAYS,
    PERSON_UPCOMING_DAYS as EDGE_UPCOMING_DAYS,
    UPCOMING_GRACE_MS as EDGE_GRACE_MS,
} from '../../functions/lib/schedule-person.js';
import { PERSON_RECENT_DAYS, PERSON_UPCOMING_DAYS } from '../../src/features/schedule/personSource';
import { UPCOMING_GRACE_MS } from '../../src/features/schedule/filters';
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
        const found = ok([{ name: '台一', img_url: 'https://yt3.ggpht.com/a=s88-c', schedule_indexable: false, youtube_channel_id: 'UCabcdefghijklmnopqrstuv', twitch_channel_id: 'TaiOne' }]);
        expect(await resolveSchedulePerson(env, '/schedule/taione', found)).toEqual({ kind: 'found', name: '台一', image: 'https://yt3.ggpht.com/a=s400-c', indexable: false, youtube: 'UCabcdefghijklmnopqrstuv', twitch: 'taione', streams: null });
        expect(found.mock.calls[0][1]).toMatch(/^vtubers\?select=name,img_url,schedule_indexable,youtube_channel_id,twitch_channel_id,active:streams\(.*&slug=eq\.taione&limit=1&/);
        // 一支查詢拿齊；不可索引的頁不放場次
        expect(found).toHaveBeenCalledTimes(1);
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
        expect(found).toHaveBeenCalledTimes(1); // 第二次走快取
        const failing = vi.fn(async () => ({ ok: false, data: null }));
        await resolveSchedulePerson(env, '/schedule/other', failing, cache);
        expect([...store.keys()].some((k) => k.endsWith('/other'))).toBe(false);
    });
});

describe('個人頁內文（edge 放進 #root）', () => {
    const NOW = Date.parse('2026-10-08T12:00:00Z');
    const H = 3_600_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const vt = { name: '台一', img_url: null, schedule_indexable: true, youtube_channel_id: 'UCabcdefghijklmnopqrstuv', twitch_channel_id: 'taione' };
    /** personQuery 那一列（本人＋嵌入的三個 streams 別名） */
    const row = (active: unknown[], recent: unknown[], count = recent.length) => ({ ...vt, active, recent, recent_count: [{ count }] });

    it('一支查詢拿齊：嵌入三個 streams 別名，條件與頁面一致（週表框、被合併的列不列；最近 90 天）', () => {
        const q = personQuery('taione', NOW);
        expect(q.startsWith('vtubers?select=name,img_url,schedule_indexable,youtube_channel_id,twitch_channel_id,active:streams(')).toBe(true);
        expect(q).toContain('recent_count:streams(count)');
        expect(q).toContain('&slug=eq.taione&limit=1');
        for (const alias of ['active', 'recent', 'recent_count']) {
            expect(q).toContain(`&${alias}.is_schedule_frame=eq.false`);
            expect(q).toContain(`&${alias}.merged_with=is.null`);
        }
        expect(q).toContain('&active.status=in.(scheduled,live)&active.order=scheduled_start.asc.nullsfirst&active.limit=100');
        const since = encodeURIComponent(iso(NOW - 90 * 24 * H));
        expect(q).toContain(`&recent.status=eq.ended&recent.actual_end=gte.${since}&recent.order=actual_end.desc&recent.limit=10`);
        expect(q).toContain(`&recent_count.status=eq.ended&recent_count.actual_end=gte.${since}`);
    });

    it('場次切分與頁面一致：live 全收、排程只收 now−15 分～7 天內、最近只收有 actual_end 的；總數取 count', () => {
        const active = [
            { status: 'live', title: '直播中', platform: 'twitch', scheduled_start: null, actual_start: iso(NOW - H) },
            { status: 'scheduled', title: '剛過 10 分', platform: 'youtube', scheduled_start: iso(NOW - 10 * 60_000) },
            { status: 'scheduled', title: '過了 20 分', platform: 'youtube', scheduled_start: iso(NOW - 20 * 60_000) },
            { status: 'scheduled', title: '6 天後', platform: 'youtube', scheduled_start: iso(NOW + 6 * 24 * H) },
            { status: 'scheduled', title: '8 天後', platform: 'youtube', scheduled_start: iso(NOW + 8 * 24 * H) },
        ];
        const recent = [
            { status: 'ended', title: '昨晚', platform: 'youtube', actual_start: iso(NOW - 26 * H), actual_end: iso(NOW - 24 * H) },
            { status: 'ended', title: '沒結束時間', platform: 'youtube', actual_start: iso(NOW - 50 * H), actual_end: null },
        ];
        const s = personStreamsFromRow(row(active, recent, 57), NOW);
        expect(s?.live.map((x) => x.title)).toEqual(['直播中']);
        expect(s?.upcoming.map((x) => x.title)).toEqual(['剛過 10 分', '6 天後']);
        expect(s?.recent.map((x) => x.title)).toEqual(['昨晚']);
        expect(s?.recentTotal).toBe(57);
        expect(personStreamsFromRow({ ...vt }, NOW)).toBeNull();
    });

    it('查無此人與不可索引都只花 1 支查詢；可索引卻拿不到場次時只短暫快取', async () => {
        const store = new Map<string, Response>();
        const cache = {
            match: async (req: Request) => store.get(req.url)?.clone() ?? undefined,
            put: async (req: Request, res: Response) => { store.set(req.url, res); },
        };
        const none = ok([]);
        expect(await resolveSchedulePerson(env, '/schedule/nobody', none, cache)).toEqual({ kind: 'notfound' });
        expect(none).toHaveBeenCalledTimes(1);
        const degraded = ok([{ ...vt }]); // 嵌入資料缺漏
        const r = await resolveSchedulePerson(env, '/schedule/taione', degraded, cache);
        expect(r).toMatchObject({ kind: 'found', indexable: true, streams: null });
        expect(degraded).toHaveBeenCalledTimes(1);
        const cached = [...store.entries()].find(([k]) => k.endsWith('/taione'))?.[1];
        expect(cached?.headers.get('Cache-Control')).toBe('public, max-age=30');
        const full = ok([row([], [])]);
        await resolveSchedulePerson(env, '/schedule/full1', full, cache);
        expect([...store.entries()].find(([k]) => k.endsWith('/full1'))?.[1].headers.get('Cache-Control')).toBe('public, max-age=300');
        const html = renderPersonBodyHtml('zh-TW', r, 'taione');
        expect(html).toContain('台一</h1>');
        expect(html).not.toContain('<section');
    });

    it('HTML 一律跳脫：名字與標題含標籤、引號', () => {
        const person = {
            name: '<img src=x onerror=alert(1)>',
            youtube: null,
            twitch: null,
            streams: { live: [], upcoming: [{ title: '"></time><script>x</script>', platform: 'youtube', start: iso(NOW + H) }], recent: [], recentTotal: 0, upcomingTotal: 1 },
        };
        const html = renderPersonBodyHtml('en', person, 'abc');
        expect(html).not.toMatch(/<script|<img/);
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).toContain('&quot;&gt;&lt;/time&gt;&lt;script&gt;');
    });

    it('內文含麵包屑、h1、摘要、各區塊與頻道連結；description 以摘要開頭', async () => {
        const recent = [{ status: 'ended', title: '昨晚歌回', platform: 'youtube', actual_start: iso(NOW - 26 * H), actual_end: iso(NOW - 24 * H) }];
        const upcoming = [{ status: 'scheduled', title: '雜談', platform: 'twitch', scheduled_start: iso(Date.now() + 2 * H) }];
        const r = await resolveSchedulePerson(env, '/schedule/taione', ok([row(upcoming, recent, 12)]), null);
        const html = renderPersonBodyHtml('zh-TW', r, 'taione');
        expect(html).toMatch(/^<div class="min-h-svh">/);
        expect(html).toContain('<a href="/schedule">開台週表</a>');
        expect(html).toContain('台一：近 90 天開台 12 次，接下來 7 天有 1 場排程。');
        expect(html).toContain('>接下來 7 天</h2>');
        expect(html).toContain('雜談（Twitch）');
        expect(html).toContain('>最近 90 天</h2>');
        expect(html).toContain('href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"');
        expect(html).toContain('href="https://www.twitch.tv/taione"');
        expect(html).toMatch(/<time datetime="2026-10-07T10:00:00.000Z">10\/7.*18:00<\/time>/);
        const meta = schedulePersonMeta('zh-TW', '台一', r.kind === 'found' ? r.streams : null);
        expect(meta.description.startsWith('台一：近 90 天開台 12 次，接下來 7 天有 1 場排程。 台一 的開台週表')).toBe(true);
    });

    it('文案與 i18n 一致（zh-TW／en）', () => {
        for (const [lang, dict] of [['zh-TW', zhTWSchedule], ['en', enSchedule]] as const) {
            const d = dict as Record<string, string>;
            const b = SCHEDULE_PERSON_BODY[lang];
            expect(b.schedule).toBe(d['title']);
            expect(b.live).toBe(d['person.live']);
            expect(b.upcoming).toBe(d['person.upcoming']);
            expect(b.recent).toBe(d['person.recent']);
            expect(b.youtube).toBe(d['person.openYouTube']);
            expect(b.twitch).toBe(d['person.openTwitch']);
            expect(b.summary).toBe(d['person.seo.summary']);
        }
    });

    it('天數與頁面、migration 一致', () => {
        expect(EDGE_RECENT_DAYS).toBe(PERSON_RECENT_DAYS);
        expect(EDGE_UPCOMING_DAYS).toBe(PERSON_UPCOMING_DAYS);
        expect(EDGE_GRACE_MS).toBe(UPCOMING_GRACE_MS);
        const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261008130000_schedule_indexable_align.sql'), 'utf8');
        expect(sql).toContain(`actual_end >= now() - interval '${PERSON_RECENT_DAYS} days'`);
        expect(sql).toContain(`scheduled_start <= now() + interval '${PERSON_UPCOMING_DAYS} days'`);
        expect(sql).toContain(`scheduled_start >= now() - interval '${UPCOMING_GRACE_MS / 60_000} minutes'`);
        expect(sql).toContain('merged_with is null');
    });
});

describe('catch-all 接線', () => {
    it('個人頁把內文放進 #root（含不可索引頁的 h1），description 帶場次摘要', () => {
        const src = readFileSync(resolve(__dirname, '../../functions/[[path]].js'), 'utf8');
        expect(src).toContain('meta = schedulePersonMeta(lang, person.name, person.streams);');
        expect(src).toMatch(/if \(person\.kind === 'found'\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*const bodyHtml = renderPersonBodyHtml\(lang, person,/);
        expect(src).toContain("rewriter.on('div#root'");
    });
});

describe('catch-all 接線（既有）', () => {
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
