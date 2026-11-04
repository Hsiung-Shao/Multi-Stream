// 週表嵌入（/embed/schedule/*）：參數、HTML／SVG 輸出、標頭、狀態碼、301、團體端點、頭像抓取
// T 編號對應計畫〈週表嵌入產生器〉的測試規格表
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import {
    EMBED_TEXT,
    EMBED_CACHE_TTL_S,
    EMBED_ERROR_TTL_S,
    EMBED_MAX_DAYS,
    CARD_W,
    CARD_H,
    parseEmbedOptions,
    clip,
    renderEmbedHtml,
    renderCardSvg,
    avatarDataUri,
    embedResponseHeaders,
    escapeXml,
    renderMessageSvg,
} from '../../functions/lib/schedule-embed.js';
// @ts-expect-error 同上
import { handleEmbed } from '../../functions/embed/schedule/[slug].js';
// @ts-expect-error 同上
import { handleCard } from '../../functions/embed/schedule/[slug]/card.js';
// @ts-expect-error 同上
import { handleGroupEmbed } from '../../functions/embed/schedule/group/[id].js';
// @ts-expect-error 同上
import { resolveSchedulePerson, renderPersonBodyHtml } from '../../functions/lib/schedule-person.js';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-test' };
const NOW = Date.parse('2026-10-08T12:00:00Z');
const H = 3_600_000;
const DAY = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();

// 整檔擋掉對外網路：沒傳 deps 的路徑不能真的連出去
beforeAll(() => vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 404 }))));
afterAll(() => vi.unstubAllGlobals());

type Stream = { title: string; platform: 'youtube' | 'twitch'; start: string | null; tbd?: true; member?: string };
const subject = (live: Stream[], upcoming: Stream[], over: Record<string, unknown> = {}) => ({
    name: '台一',
    image: null as string | null,
    streams: { live, upcoming },
    pagePath: '/schedule/taione',
    ...over,
});
const yt = (title: string, startMs: number): Stream => ({ title, platform: 'youtube', start: iso(startMs) });

/** resolveSchedulePerson 的 found 形狀 */
const found = (live: Stream[] = [], upcoming: Stream[] = [], over: Record<string, unknown> = {}) => ({
    kind: 'found',
    name: '台一',
    image: null,
    indexable: true,
    youtube: null,
    twitch: null,
    streams: { live, upcoming, recent: [], recentTotal: 0, upcomingTotal: upcoming.length },
    related: null,
    ...over,
});
const ctx = (slug: string, qs = '', extra: Record<string, unknown> = {}) => ({
    request: new Request(`https://multistreaming.org/embed/schedule/${slug}${qs}`),
    env,
    params: { slug },
    ...extra,
});
/** 把相對或絕對的 Location 解析成 URL，方便比對路徑與查詢字串 */
const loc = (res: Response) => new URL(res.headers.get('Location') ?? '', 'https://multistreaming.org');

describe('T1 嵌入參數', () => {
    it('壞參數退回預設值 en／light／7', () => {
        expect(parseEmbedOptions(new URLSearchParams('lang=xx&theme=blue&days=abc'))).toEqual({ lang: 'en', theme: 'light', days: 7 });
        expect(parseEmbedOptions(new URLSearchParams(''))).toEqual({ lang: 'en', theme: 'light', days: 7 });
    });

    it('days 超過上限仍是 7、合法值照用', () => {
        expect(EMBED_MAX_DAYS).toBe(7);
        expect(parseEmbedOptions(new URLSearchParams('days=99')).days).toBe(7);
        expect(parseEmbedOptions(new URLSearchParams('lang=zh-TW&theme=dark&days=3'))).toEqual({ lang: 'zh-TW', theme: 'dark', days: 3 });
    });

    it('常數：快取 300 秒、失敗 30 秒、卡片 1200x675', () => {
        expect([EMBED_CACHE_TTL_S, EMBED_ERROR_TTL_S, CARD_W, CARD_H]).toEqual([300, 30, 1200, 675]);
    });

    it('文案 zh-TW 與 en 都有齊所有 key', () => {
        for (const lang of ['zh-TW', 'en']) {
            for (const k of ['schedule', 'live', 'upcoming', 'none', 'timeTbd', 'tz', 'more', 'powered', 'notFound', 'error']) {
                expect(typeof EMBED_TEXT[lang][k], `${lang}.${k}`).toBe('string');
            }
            expect(EMBED_TEXT[lang].upcoming).toContain('{{days}}');
            expect(EMBED_TEXT[lang].none).toContain('{{days}}');
        }
    });
});

describe('clip：全形算 2、半形算 1', () => {
    // 去掉結尾 … 後的顯示寬度
    const units = (s: string) => [...s.replace(/…$/, '')].reduce((n, c) => n + (c.codePointAt(0)! > 0x2e7f ? 2 : 1), 0);

    it('未超過原樣回傳（含剛好等於上限）', () => {
        expect(clip('abc', 5)).toBe('abc');
        expect(clip('abcde', 5)).toBe('abcde');
        expect(clip('字字', 4)).toBe('字字');
    });

    it('超過就截斷並加 …，被截的內容寬度不超過上限', () => {
        const half = clip('abcdefghij', 5);
        expect(half.endsWith('…')).toBe(true);
        expect(units(half)).toBeLessThanOrEqual(5);
        const full = clip('字'.repeat(10), 8);
        expect(full.endsWith('…')).toBe(true);
        expect(full.startsWith('字')).toBe(true);
        // 全形若被當成半形，會留下 8 個字
        expect(units(full)).toBeLessThanOrEqual(8);
    });

    it('surrogate pair（emoji）不會被切成半個', () => {
        const out = clip('😀'.repeat(5), 4);
        expect(out).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
        expect(out).not.toMatch(/(?<![\ud800-\udbff])[\udc00-\udfff]/);
        expect(out.endsWith('…')).toBe(true);
    });
});

describe('T2 嵌入頁 HTML：回連結與 noindex', () => {
    const opts = (lang: string) => ({ lang, theme: 'light', days: 7 });

    it('含 noindex、回連結指向個人週表頁且 rel 沒有 nofollow（zh-TW 帶語言前綴）', () => {
        const html: string = renderEmbedHtml(subject([], [yt('雜談', NOW + H)]), opts('zh-TW'), NOW);
        expect(html).toContain('<meta name="robots" content="noindex">');
        const anchors = html.match(/<a\b[^>]*>/g) ?? [];
        const back = anchors.find((a) => a.includes('href="https://multistreaming.org/zh-TW/schedule/taione"'));
        expect(back, '找不到回連結').toBeTruthy();
        expect(back).not.toMatch(/nofollow/i);
    });

    it('en 版回連結沒有 /zh-TW 前綴', () => {
        const html: string = renderEmbedHtml(subject([], []), opts('en'), NOW);
        expect(html).toContain('href="https://multistreaming.org/schedule/taione"');
        expect(html).not.toContain('/zh-TW/schedule/taione');
    });

    it('沒有任何 <script，資料字串全部逃脫', () => {
        const evil = subject([yt('"><script>alert(1)</script>', NOW - H)], [yt('<img src=x onerror=1>', NOW + H)], { name: '<b>台一</b>' });
        const html: string = renderEmbedHtml(evil, opts('en'), NOW);
        expect(html).not.toMatch(/<script/i);
        expect(html).not.toContain('<img src=x');
        expect(html).not.toContain('<b>台一</b>');
        expect(html).toContain('&lt;img src=x onerror=1&gt;');
    });

    it('streams 為 null（無資料）也能輸出完整頁、不拋錯', () => {
        const html: string = renderEmbedHtml(subject([], [], { streams: null }), opts('en'), NOW);
        expect(html).toContain('<meta name="robots" content="noindex">');
    });
});

describe('T4 days 只列範圍內場次', () => {
    const upcoming = [yt('DAY2STREAM', NOW + 2 * DAY), yt('DAY5STREAM', NOW + 5 * DAY)];
    const livePart = [yt('LIVENOWSTREAM', NOW - H)];

    it('HTML：days=3 只列第 2 天那場，days=7 兩場都列', () => {
        const three: string = renderEmbedHtml(subject([], upcoming), { lang: 'en', theme: 'light', days: 3 }, NOW);
        expect(three).toContain('DAY2STREAM');
        expect(three).not.toContain('DAY5STREAM');
        const seven: string = renderEmbedHtml(subject([], upcoming), { lang: 'en', theme: 'light', days: 7 }, NOW);
        expect(seven).toContain('DAY2STREAM');
        expect(seven).toContain('DAY5STREAM');
    });

    it('HTML：直播中的一律列出，不受 days 限制', () => {
        const html: string = renderEmbedHtml(subject(livePart, upcoming), { lang: 'en', theme: 'light', days: 1 }, NOW);
        expect(html).toContain('LIVENOWSTREAM');
        expect(html).not.toContain('DAY2STREAM');
    });

    it('SVG：days=3 只列第 2 天那場，days=7 兩場都列', () => {
        const three: string = renderCardSvg(subject([], upcoming), { lang: 'en', theme: 'light', days: 3 }, null, NOW);
        expect(three).toContain('DAY2STREAM');
        expect(three).not.toContain('DAY5STREAM');
        const seven: string = renderCardSvg(subject([], upcoming), { lang: 'en', theme: 'light', days: 7 }, null, NOW);
        expect(seven).toContain('DAY5STREAM');
    });
});

describe('T5 卡片 SVG：逃脫與截斷', () => {
    const opts = (lang = 'zh-TW') => ({ lang, theme: 'light', days: 7 });

    it('基本結構：以 <svg 開頭、尺寸 1200x675', () => {
        const svg: string = renderCardSvg(subject([], []), opts(), null, NOW);
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain('width="1200" height="675"');
    });

    it('標題含 <>&" 時全部逃脫，原始字元不外漏', () => {
        const svg: string = renderCardSvg(subject([], [yt('a<b>&"c', NOW + H)]), opts(), null, NOW);
        expect(svg).toContain('a&lt;b&gt;&amp;&quot;c');
        expect(svg).not.toContain('a<b');
        expect(svg).not.toMatch(/<script/i);
    });

    it('超過 44 單位的標題被截斷並以 … 結尾', () => {
        const longTitle = '字'.repeat(60);
        const svg: string = renderCardSvg(subject([], [yt(longTitle, NOW + H)]), opts(), null, NOW);
        expect(svg).not.toContain('字'.repeat(23));
        expect(svg).toMatch(/字{15,22}…/);
    });

    it('頭像：null 畫純色圓、不含 <image；有頭像用 data URI <image>', () => {
        const none: string = renderCardSvg(subject([], []), opts(), null, NOW);
        expect(none).toContain('<circle');
        expect(none).not.toContain('<image');
        const withImg: string = renderCardSvg(subject([], []), opts(), 'data:image/jpeg;base64,AAAA', NOW);
        expect(withImg).toContain('<image href="data:');
    });

    it('頁尾網址：zh-TW 帶 /zh-TW，en 不帶', () => {
        const zh: string = renderCardSvg(subject([], []), opts('zh-TW'), null, NOW);
        expect(zh).toContain('multistreaming.org/zh-TW/schedule/taione');
        const en: string = renderCardSvg(subject([], []), opts('en'), null, NOW);
        expect(en).toContain('multistreaming.org/schedule/taione');
        expect(en).not.toContain('/zh-TW/schedule/taione');
    });

    it('最多列 5 場，其餘寫「還有 N 場」／「and N more」', () => {
        const names = ['AAAITEM', 'BBBITEM', 'CCCITEM', 'DDDITEM', 'EEEITEM', 'FFFITEM', 'GGGITEM'];
        const upcoming = names.map((n, i) => yt(n, NOW + (i + 1) * H));
        const zh: string = renderCardSvg(subject([], upcoming), opts('zh-TW'), null, NOW);
        for (const n of names.slice(0, 5)) expect(zh).toContain(n);
        for (const n of names.slice(5)) expect(zh).not.toContain(n);
        expect(zh).toContain('還有 2 場');
        const en: string = renderCardSvg(subject([], upcoming), opts('en'), null, NOW);
        expect(en).toContain('and 2 more');
    });
});

describe('T6 頭像抓取', () => {
    const png = (bytes: Uint8Array, type = 'image/png') => new Response(bytes, { status: 200, headers: { 'Content-Type': type } });
    const url = 'https://yt3.ggpht.com/a=s400-c';

    it('成功 → data:image/jpeg;base64，內容與原 bytes 相同', async () => {
        const bytes = new Uint8Array([1, 2, 3, 4, 5]);
        const out = await avatarDataUri(url, vi.fn(async () => png(bytes, 'image/jpeg')));
        expect(out).toBe(`data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`);
    });

    it('fetch 回 500 → null', async () => {
        expect(await avatarDataUri(url, vi.fn(async () => new Response('x', { status: 500 })))).toBeNull();
    });

    it('content-type 不是 png／jpeg／webp → null', async () => {
        expect(await avatarDataUri(url, vi.fn(async () => png(new Uint8Array([1]), 'text/html')))).toBeNull();
        expect(await avatarDataUri(url, vi.fn(async () => png(new Uint8Array([1]), 'image/svg+xml')))).toBeNull();
    });

    it('內容超過 200KB → null', async () => {
        const big = new Uint8Array(200 * 1024 + 1);
        expect(await avatarDataUri(url, vi.fn(async () => png(big)))).toBeNull();
    });

    it('fetch 拋錯 → null，不往外拋', async () => {
        const boom = vi.fn(async () => { throw new Error('network'); });
        expect(await avatarDataUri(url, boom)).toBeNull();
    });
});

describe('T7 嵌入回應標頭', () => {
    const lower = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

    it('embedResponseHeaders：noindex、nosniff、快取秒數、CSP 無 frame-ancestors、無 X-Frame-Options', () => {
        const h = lower(embedResponseHeaders(300));
        expect(h['cache-control']).toBe('public, max-age=300');
        expect(h['x-robots-tag']).toBe('noindex');
        expect(h['x-content-type-options']).toBe('nosniff');
        expect(h['content-security-policy']).toBeTruthy();
        // 有 frame-ancestors 會讓別人的網站嵌不進來
        expect(h['content-security-policy']).not.toContain('frame-ancestors');
        expect(h['content-type']).toBeTruthy();
        expect('x-frame-options' in h).toBe(false);
        expect(lower(embedResponseHeaders(30))['cache-control']).toBe('public, max-age=30');
    });

    const assertEmbeddable = (res: Response) => {
        expect(res.headers.get('X-Frame-Options')).toBeNull();
        expect(res.headers.get('Content-Security-Policy') ?? '').not.toContain('frame-ancestors');
        expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    };

    it('HTML handler 200 帶上述標頭', async () => {
        const res = await handleEmbed(ctx('taione'), { resolve: vi.fn(async () => found()), record: vi.fn() });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/^text\/html/);
        assertEmbeddable(res);
    });

    it('SVG handler 200 帶上述標頭', async () => {
        const res = await handleCard(ctx('taione', '/card'), { resolve: vi.fn(async () => found()), avatar: vi.fn(async () => null), record: vi.fn(), cache: null });
        expect(res.status).toBe(200);
        assertEmbeddable(res);
    });
});

describe('T8 slug 大小寫 301 保留查詢字串', () => {
    const redirect = { kind: 'redirect', location: '/schedule/taione' };

    it('HTML：301 到 /embed/schedule/<小寫> 且查詢字串不變', async () => {
        const res = await handleEmbed(ctx('TaiOne', '?lang=zh-TW&theme=dark&days=3'), { resolve: vi.fn(async () => redirect), record: vi.fn() });
        expect(res.status).toBe(301);
        const to = loc(res);
        expect(to.pathname).toBe('/embed/schedule/taione');
        expect(Object.fromEntries(to.searchParams)).toEqual({ lang: 'zh-TW', theme: 'dark', days: '3' });
    });

    it('card：301 到 /embed/schedule/<小寫>/card 且查詢字串不變', async () => {
        const c = { request: new Request('https://multistreaming.org/embed/schedule/TaiOne/card?theme=dark'), env, params: { slug: 'TaiOne' } };
        const res = await handleCard(c, { resolve: vi.fn(async () => redirect), avatar: vi.fn(async () => null), record: vi.fn(), cache: null });
        expect(res.status).toBe(301);
        const to = loc(res);
        expect(to.pathname).toBe('/embed/schedule/taione/card');
        expect(to.searchParams.get('theme')).toBe('dark');
    });

    it('沒有查詢字串時 Location 不多帶 ?', async () => {
        const res = await handleEmbed(ctx('TaiOne'), { resolve: vi.fn(async () => redirect), record: vi.fn() });
        expect(loc(res).search).toBe('');
    });
});

describe('T9 查無此人與查詢失敗', () => {
    it('查無此人：HTML 404、快取 300 秒', async () => {
        const res = await handleEmbed(ctx('nobody'), { resolve: vi.fn(async () => ({ kind: 'notfound' })), record: vi.fn() });
        expect(res.status).toBe(404);
        expect(res.headers.get('Cache-Control')).toContain('max-age=300');
    });

    it('查詢失敗：HTML 503、只快取 30 秒', async () => {
        const res = await handleEmbed(ctx('taione'), { resolve: vi.fn(async () => ({ kind: 'error' })), record: vi.fn() });
        expect(res.status).toBe(503);
        expect(res.headers.get('Cache-Control')).toContain('max-age=30');
        expect(res.headers.get('Cache-Control')).not.toContain('max-age=300');
    });

    it('card 查無此人：404 且仍是 SVG', async () => {
        const res = await handleCard(ctx('nobody', '/card'), { resolve: vi.fn(async () => ({ kind: 'notfound' })), avatar: vi.fn(async () => null), record: vi.fn(), cache: null });
        expect(res.status).toBe(404);
        expect(res.headers.get('Content-Type') ?? '').toMatch(/^image\/svg\+xml/);
        expect((await res.text()).startsWith('<svg')).toBe(true);
    });

    it('card 查詢失敗：503', async () => {
        const res = await handleCard(ctx('taione', '/card'), { resolve: vi.fn(async () => ({ kind: 'error' })), avatar: vi.fn(async () => null), record: vi.fn(), cache: null });
        expect(res.status).toBe(503);
    });
});

describe('統計 record 的呼叫時機', () => {
    it('found 時呼叫一次且帶 kind=person 與 slug', async () => {
        const record = vi.fn();
        await handleEmbed(ctx('taione'), { resolve: vi.fn(async () => found()), record });
        expect(record).toHaveBeenCalledTimes(1);
        expect(record.mock.calls[0][0]).toMatchObject({ kind: 'person', slug: 'taione' });
    });

    it('404 時不呼叫', async () => {
        const record = vi.fn();
        await handleEmbed(ctx('nobody'), { resolve: vi.fn(async () => ({ kind: 'notfound' })), record });
        expect(record).not.toHaveBeenCalled();
    });
});

describe('card 快取', () => {
    it('第二次相同請求命中快取，resolve 只被呼叫一次', async () => {
        const store = new Map<string, Response>();
        const key = (r: Request | string) => (typeof r === 'string' ? r : r.url);
        const cache = {
            match: async (r: Request | string) => store.get(key(r))?.clone(),
            put: async (r: Request | string, res: Response) => { store.set(key(r), res.clone()); },
        };
        const resolve = vi.fn(async () => found([], [yt('雜談', NOW + H)]));
        const deps = { resolve, avatar: vi.fn(async () => null), record: vi.fn(), cache };
        const run = async () => {
            const pending: Promise<unknown>[] = [];
            const c = { ...ctx('taione', '/card?theme=dark'), waitUntil: (p: Promise<unknown>) => { pending.push(p); } };
            const res = await handleCard(c, deps);
            await Promise.all(pending);
            return res;
        };
        const first = await run();
        const second = await run();
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect((await second.text()).startsWith('<svg')).toBe(true);
        expect(resolve).toHaveBeenCalledTimes(1);
    });
});

describe('T14 團體端點', () => {
    const ID = '3f2b8c1e-0a4d-4e6b-9c1d-2a7f5e8b9d10';
    const item = (name: string, over: Record<string, unknown> = {}) => ({
        member_name: name, member_slug: name.toLowerCase(), img_url: null, title: `${name} 的直播`, platform: 'youtube',
        status: 'scheduled', scheduled_start: iso(Date.now() + 2 * H), actual_start: null, time_tbd: false, ...over,
    });
    const gctx = (id: string, qs = '') => ({ request: new Request(`https://multistreaming.org/embed/schedule/group/${id}${qs}`), env, params: { id } });
    const data = { group: { id: ID, name: '子午計畫', parent_name: null }, items: [item('Alice'), item('Bob', { status: 'live', scheduled_start: null, actual_start: iso(Date.now() - H) })] };

    it('id 不是 uuid → 404，且不呼叫 rpc', async () => {
        const rpc = vi.fn(async () => ({ ok: true, data }));
        const res = await handleGroupEmbed(gctx('not-a-uuid'), { rpc });
        expect(res.status).toBe(404);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('rpc 回 data=null（查無團體）→ 404', async () => {
        const res = await handleGroupEmbed(gctx(ID), { rpc: vi.fn(async () => ({ ok: true, data: null })) });
        expect(res.status).toBe(404);
    });

    it('rpc 失敗 → 503', async () => {
        const res = await handleGroupEmbed(gctx(ID), { rpc: vi.fn(async () => ({ ok: false, data: null })) });
        expect(res.status).toBe(503);
    });

    it('正常 → 200 HTML，含團名與每位成員，rpc 帶 p_group_id', async () => {
        const rpc = vi.fn(async () => ({ ok: true, data }));
        const res = await handleGroupEmbed(gctx(ID), { rpc });
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith(env, 'schedule_group_embed', { p_group_id: ID });
        const html = await res.text();
        expect(html).toContain('子午計畫');
        expect(html).toContain('Alice');
        expect(html).toContain('Bob');
    });

    it('回連結指向名錄 /vtubers（zh-TW 帶語言前綴），且不含 nofollow', async () => {
        const rpc = vi.fn(async () => ({ ok: true, data }));
        const en = await (await handleGroupEmbed(gctx(ID), { rpc })).text();
        expect(en).toContain('https://multistreaming.org/vtubers');
        const zh = await (await handleGroupEmbed(gctx(ID, '?lang=zh-TW'), { rpc })).text();
        expect(zh).toContain('https://multistreaming.org/zh-TW/vtubers');
        const anchors = zh.match(/<a\b[^>]*>/g) ?? [];
        expect(anchors.find((a) => a.includes('/zh-TW/vtubers'))).not.toMatch(/nofollow/i);
    });

    it('成員名稱經逃脫、頁面無 <script', async () => {
        const evil = { ...data, items: [item('<script>x</script>')] };
        const html = await (await handleGroupEmbed(gctx(ID), { rpc: vi.fn(async () => ({ ok: true, data: evil })) })).text();
        expect(html).not.toMatch(/<script/i);
        expect(html).toContain('&lt;script&gt;');
    });
});

describe('T3 不可索引者也有場次資料給嵌入用', () => {
    const row = (title: string) => ({
        name: '台一', img_url: null, schedule_indexable: false, youtube_channel_id: null, twitch_channel_id: null,
        active: [{ status: 'scheduled', title, platform: 'youtube', scheduled_start: iso(Date.now() + 2 * H) }],
        recent: [], recent_count: [{ count: 0 }],
    });

    it('streams 非 null 且有 1 場接下來；但個人頁內文不含該場標題', async () => {
        const queryFn = vi.fn(async () => ({ ok: true, status: 200, data: [row('SECRETTITLE')], error: null }));
        const relatedFn = vi.fn(async () => ({ ok: true, data: { agency: null, siblings: [], neighbors: [] } }));
        const result = await resolveSchedulePerson(env, '/schedule/xx', queryFn, null, relatedFn);
        expect(result.kind).toBe('found');
        expect(result.indexable).toBe(false);
        // 嵌入頁要用這份場次；少了就畫不出週表
        expect(result.streams).not.toBeNull();
        expect(result.streams.upcoming.length).toBe(1);
        // noindex 頁的 SSR 內文仍不放場次，避免薄內容被收錄
        const html: string = renderPersonBodyHtml('zh-TW', result, 'xx');
        expect(html).not.toContain('SECRETTITLE');
    });
});

describe('T5b XML 不允許的控制字元', () => {
    const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
    const opts = { lang: 'zh-TW', theme: 'light', days: 7 };

    it('renderCardSvg：名字與標題的控制字元被去掉，一般字元保留', () => {
        const svg: string = renderCardSvg(subject([], [yt('x\u0001y', NOW + H), yt('\u000b', NOW + 2 * H), yt('正常標題', NOW + 3 * H)], { name: 'A\u0008B' }), opts, null, NOW);
        // 控制字元會讓 SVG 變成不合法 XML，瀏覽器整張不顯示
        expect(svg).not.toMatch(BAD);
        expect(svg).toContain('AB');
        expect(svg).toContain('xy');
        expect(svg).toContain('正常標題');
    });

    it('renderMessageSvg：訊息含控制字元時輸出不含它們', () => {
        const svg: string = renderMessageSvg('A\u0008B x\u0001y \u000b', opts);
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).not.toMatch(BAD);
    });

    it('escapeXml：先去控制字元再逃脫 < > & "', () => {
        const out: string = escapeXml('a\u0008<b>&"c\u0001');
        expect(out).not.toMatch(BAD);
        expect(out).toContain('a&lt;b&gt;&amp;&quot;c');
        expect(escapeXml('plain 正常\n')).toBe('plain 正常\n');
    });
});

describe('T7b 卡片頁尾網址', () => {
    const footer = (svg: string) => (svg.match(/<text[^>]*>([^<]*multistreaming\.org[^<]*)<\/text>/) ?? [])[1] ?? '';

    it('pagePath 帶 # 時頁尾只留路徑，不出現錨點', () => {
        const path = '/vtubers#directory-group-f019ffb6-dd1d-4b1c-9fd6-4a6b2a9fd70f';
        const svg: string = renderCardSvg(subject([], [], { pagePath: path }), { lang: 'zh-TW', theme: 'light', days: 7 }, null, NOW);
        expect(svg).toContain('multistreaming.org/zh-TW/vtubers');
        expect(svg).not.toContain('#directory-group');
    });

    it('網址很長時頁尾以 … 結尾且不超過 70 字元', () => {
        const svg: string = renderCardSvg(subject([], [], { pagePath: `/schedule/${'a'.repeat(40)}` }), { lang: 'zh-TW', theme: 'light', days: 7 }, null, NOW);
        const f = footer(svg);
        expect(f, '找不到頁尾文字').not.toBe('');
        expect(f.endsWith('…')).toBe(true);
        expect([...f].length).toBeLessThanOrEqual(70);
    });
});

describe('T6b 頭像 content-length 預檢', () => {
    it('content-length 超過 200KB 直接回 null，不讀 body', async () => {
        const arrayBuffer = vi.fn(async () => new ArrayBuffer(8));
        const fake = { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png', 'content-length': String(200 * 1024 + 1) }), arrayBuffer, body: null };
        const out = await avatarDataUri('https://yt3.ggpht.com/a=s400-c', vi.fn(async () => fake));
        expect(out).toBeNull();
        // 先看標頭就擋；讀了 body 才發現太大，記憶體已經花掉了
        expect(arrayBuffer).not.toHaveBeenCalled();
    });
});

describe('T14b 團體端點：超出列數的場次', () => {
    const ID = '3f2b8c1e-0a4d-4e6b-9c1d-2a7f5e8b9d10';
    const mk = (i: number) => ({
        member_name: `M${i}`, member_slug: `m${i}`, img_url: null, title: `T${i}`, platform: 'youtube', status: 'scheduled',
        scheduled_start: iso(Date.now() + (i + 1) * 60_000), actual_start: null, time_tbd: false,
    });
    const items = Array.from({ length: 100 }, (_, i) => mk(i));
    const run = async (total: number | undefined, lang: string) => {
        const data = { group: { id: ID, name: '子午計畫', parent_name: null }, items, ...(total === undefined ? {} : { total }) };
        const c = { request: new Request(`https://multistreaming.org/embed/schedule/group/${ID}?lang=${lang}`), env, params: { id: ID } };
        const res = await handleGroupEmbed(c, { rpc: vi.fn(async () => ({ ok: true, data })) });
        return res.text();
    };

    it('total 120、列出 100 → 寫「還有 20 場」（zh-TW）／「and 20 more」（en）', async () => {
        expect(await run(120, 'zh-TW')).toContain('還有 20 場');
        expect(await run(120, 'en')).toContain('and 20 more');
    });

    it('total 等於列數、或沒有 total → 不出現「還有」', async () => {
        expect(await run(100, 'zh-TW')).not.toContain('還有');
        expect(await run(100, 'en')).not.toMatch(/and \d+ more/);
        expect(await run(undefined, 'zh-TW')).not.toContain('還有');
    });
});

describe('T9b card 頭像抓失敗只短暫快取', () => {
    const run = async (image: string | null) => {
        const deps = { resolve: vi.fn(async () => found([], [], { image })), avatar: vi.fn(async () => null), record: vi.fn(), cache: null };
        return handleCard(ctx('taione', '/card'), deps);
    };

    it('person.image 有值但 avatar 回 null → max-age=30', async () => {
        const res = await run('https://yt3.ggpht.com/a=s400-c');
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
    });

    it('person.image 本來就是 null → 照常 max-age=300', async () => {
        const res = await run(null);
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    });
});
