// live-og（/live 頁）：HTML 解析、偵測（抓取失敗與「沒有直播」分開、頁面必須是自己頻道的）、場次狀態轉移，
// 以及 ogSweep 的輪替、下播兩輪確認、斷路器、去重，和 API 有上限的重查
import { describe, expect, it } from 'vitest';
import { applyLiveOg, decodeHtmlEntities, detectLiveOg, extractTitle, extractVideoId, parseLiveOgHtml, type LiveOgResult } from '../../supabase/functions/_shared/live_og.ts';
import { OG_FULL_PAGE_MAX, ogSweep, refreshPending } from '../../supabase/functions/_shared/sweep.ts';
import { Db } from '../../supabase/functions/_shared/db.ts';
import { YouTubeClient } from '../../supabase/functions/_shared/youtube.ts';
import { emptyStats, type RosterChannel, type StreamRecord } from '../../supabase/functions/_shared/types.ts';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const HOUR = 3_600_000;
const UC = 'UCabcdefghijklmnopqrstuv';
const V = 'LiveVideo01';

/** 模擬 /live 頁：預設含自己的頻道 ID（真實頁面的 videoDetails／externalId 都會有） */
const page = (videoId: string | null, extra = '', channelId = UC) =>
    `<html><head>${videoId ? `<meta property="og:image" content="https://i.ytimg.com/vi/${videoId}/maxresdefault_live.jpg">` : '<meta property="og:image" content="https://yt3.ggpht.com/avatar">'}<meta property="og:title" content="今晚雜談"></head><body>"channelId":"${channelId}"${extra}</body></html>`;

function fakeFetch(opts: { status?: number; html?: string; head?: number; headThrows?: boolean; throws?: boolean; url?: string }) {
    const calls: string[] = [];
    const fn = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        if (opts.throws) throw new Error('network');
        if (url.includes('i.ytimg.com')) {
            if (opts.headThrows) throw new Error('timeout');
            return new Response(null, { status: opts.head ?? 404 });
        }
        const res = new Response(opts.html ?? '', { status: opts.status ?? 200 });
        if (opts.url) Object.defineProperty(res, 'url', { value: opts.url });
        return res;
    }) as unknown as typeof fetch;
    return { fn, calls };
}

function stream(p: Partial<StreamRecord>): StreamRecord {
    return {
        id: p.id ?? 'id', vtuber_id: 'v1', channel_id: 'c1', platform: 'youtube', external_id: 'AbCdEfGhIjK', source: 'yt_waiting_room',
        status: 'scheduled', scheduled_start: null, scheduled_end: null, actual_start: null, actual_end: null, title: null, category: null,
        thumbnail_url: null, viewer_count: null, is_schedule_frame: false, fetched_at: '2026-09-30T00:00:00Z', ...p,
    };
}
const ch = { channelId: 'c1', vtuberId: 'v1' };
const ok = (p: Partial<LiveOgResult>): LiveOgResult => ({ ok: true, isLive: false, isUpcoming: false, videoId: null, title: null, scheduledStart: null, ...p });

describe('live-og：HTML 解析', () => {
    it('videoId 三來源：og:image（兩種屬性順序）、canonical、og:url；頁面上別處的 _live.jpg 不算', () => {
        expect(extractVideoId(page(V))).toBe(V);
        expect(extractVideoId(`<meta content="https://i.ytimg.com/vi/${V}/hqdefault.jpg" property="og:image">`)).toBe(V);
        expect(extractVideoId(`<link rel="canonical" href="https://www.youtube.com/watch?v=${V}">`)).toBe(V);
        expect(extractVideoId(`<meta property="og:url" content="https://www.youtube.com/watch?v=${V}">`)).toBe(V);
        expect(extractVideoId(`推薦區塊 https://i.ytimg.com/vi/${V}/hqdefault_live.jpg`)).toBeNull();
        expect(extractVideoId(page(null))).toBeNull();
    });

    it('標題：雙引號內的單引號不截斷、HTML entity 解碼', () => {
        expect(extractTitle(`<meta property="og:title" content="It's live &amp; &#39;fun&#39;">`)).toBe("It's live & 'fun'");
        expect(decodeHtmlEntities('&lt;b&gt; &quot;x&quot; &#x4E2D;')).toBe('<b> "x" 中');
    });

    it('待機室：UPCOMING 標記與預定時間（epoch 秒轉 ISO）', () => {
        const r = parseLiveOgHtml(page(V, '"status":"UPCOMING","scheduledStartTime":"1790776800"'));
        expect(r).toMatchObject({ videoId: V, isUpcoming: true, scheduledStart: new Date(1790776800 * 1000).toISOString(), title: '今晚雜談' });
    });
});

describe('live-og：偵測', () => {
    it('非待機且 _live.jpg 回 200 → 直播中', async () => {
        const f = fakeFetch({ html: page(V), head: 200 });
        const r = await detectLiveOg(UC, { fetch: f.fn });
        expect(r).toMatchObject({ ok: true, isLive: true, videoId: V });
        expect(f.calls[0]).toContain(`/channel/${UC}/live`);
        expect(f.calls[1]).toMatch(/^HEAD https:\/\/i\.ytimg\.com/);
    });

    it('待機室不發 HEAD；頁面沒有影片 → 沒有直播；_live.jpg 明確 404 → 沒有直播', async () => {
        const up = fakeFetch({ html: page(V, '"isUpcoming":true') });
        expect(await detectLiveOg(UC, { fetch: up.fn })).toMatchObject({ ok: true, isUpcoming: true, isLive: false });
        expect(up.calls).toHaveLength(1);
        expect(await detectLiveOg(UC, { fetch: fakeFetch({ html: page(null) }).fn })).toMatchObject({ ok: true, isLive: false, videoId: null });
        expect(await detectLiveOg(UC, { fetch: fakeFetch({ html: page(V), head: 404 }).fn })).toMatchObject({ ok: true, isLive: false });
    });

    it('不可判斷就當抓取失敗：HEAD 5xx／逾時、頁面沒有自己的頻道 ID、被導到別的網域、非 200、例外', async () => {
        const failed = async (f: ReturnType<typeof fakeFetch>) => (await detectLiveOg(UC, { fetch: f.fn })).ok;
        expect(await failed(fakeFetch({ html: page(V), head: 503 }))).toBe(false);
        expect(await failed(fakeFetch({ html: page(V), headThrows: true }))).toBe(false);
        expect(await failed(fakeFetch({ html: page(null, '', 'UCsomeoneelse00000000000') }))).toBe(false); // 限流頁、sorry 頁
        expect(await failed(fakeFetch({ html: page(null), url: 'https://consent.youtube.com/m?continue=x' }))).toBe(false);
        expect(await failed(fakeFetch({ status: 500 }))).toBe(false);
        expect(await failed(fakeFetch({ throws: true }))).toBe(false);
        expect((await detectLiveOg('not-a-channel', { fetch: fakeFetch({}).fn })).ok).toBe(false);
    });
});

describe('live-og：場次狀態轉移（applyLiveOg）', () => {
    it('待機室開播：scheduled → live，記開播時間；API 的標題為準；同頻道其他 live 場次下播', () => {
        const cur = [
            stream({ id: 'a', external_id: V, title: 'API 標題', scheduled_start: new Date(NOW - HOUR).toISOString() }),
            stream({ id: 'b', external_id: 'OldLive0001', status: 'live', actual_start: '2026-09-30T08:00:00Z' }),
        ];
        const r = applyLiveOg(ch, ok({ isLive: true, videoId: V, title: 'og 標題' }), cur, undefined, NOW);
        expect(r.changed.find((s) => s.id === 'a')).toMatchObject({ status: 'live', actual_start: new Date(NOW).toISOString(), title: 'API 標題', viewer_count: null });
        expect(r.changed.find((s) => s.id === 'b')).toMatchObject({ status: 'ended', actual_end: new Date(NOW).toISOString() });
        expect(r).toMatchObject({ live: 1, ended: 1 });
    });

    it('下播要呼叫端允許（連續兩輪確認）：不允許時只記 endPending，不改場次', () => {
        const r = applyLiveOg(ch, ok({}), [stream({ id: 'a', status: 'live' })], undefined, NOW, { allowEnd: false });
        expect(r.changed).toEqual([]);
        expect(r.endPending).toBe(1);
    });

    it('資料庫沒有的直播 → 新增；沒有預定時間的待機室不新增（交給 API）', () => {
        const r = applyLiveOg(ch, ok({ isLive: true, videoId: V, title: '突發直播' }), [], undefined, NOW);
        expect(r.created).toEqual([expect.objectContaining({ external_id: V, status: 'live', vtuber_id: 'v1', channel_id: 'c1', title: '突發直播' })]);
        expect(applyLiveOg(ch, ok({ isUpcoming: true, videoId: V }), [], undefined, NOW).created).toEqual([]);
    });

    it('改期：預定時間跟著更新；過期的待機又出現 → 回到 scheduled；已開播或結束過的影片不改回待機', () => {
        const newTime = new Date(NOW + 5 * HOUR).toISOString();
        const r = applyLiveOg(ch, ok({ isUpcoming: true, videoId: V, scheduledStart: newTime }), [stream({ id: 'a', external_id: V, scheduled_start: new Date(NOW + HOUR).toISOString() })], undefined, NOW);
        expect(r.changed[0]).toMatchObject({ status: 'scheduled', scheduled_start: newTime, is_schedule_frame: false });
        expect(applyLiveOg(ch, ok({ isUpcoming: true, videoId: V, scheduledStart: newTime }), [], stream({ id: 'z', external_id: V, status: 'expired' }), NOW).changed[0]).toMatchObject({ id: 'z', status: 'scheduled' });
        const ended = stream({ id: 'e', external_id: V, status: 'ended', actual_start: '2026-09-29T10:00:00Z', actual_end: '2026-09-29T12:00:00Z' });
        expect(applyLiveOg(ch, ok({ isUpcoming: true, videoId: V, scheduledStart: newTime }), [], ended, NOW).changed).toEqual([]);
    });

    it('影片在資料庫屬於別的頻道：整個頻道這輪不動（foreign）', () => {
        const other = stream({ id: 'x', external_id: V, channel_id: 'c9', vtuber_id: 'v9', status: 'live' });
        const r = applyLiveOg(ch, ok({ isLive: true, videoId: V }), [stream({ id: 'a', status: 'live', external_id: 'Mine0000001' })], other, NOW);
        expect(r).toMatchObject({ foreign: true, changed: [], created: [] });
    });

    it('抓取失敗：什麼都不改', () => {
        const r = applyLiveOg(ch, { ...ok({}), ok: false }, [stream({ status: 'live' })], undefined, NOW);
        expect(r.changed).toEqual([]);
        expect(r.created).toEqual([]);
    });
});

/** 記錄 PostgREST 請求的假 Db；streams 查詢回 rows */
function fakeDb(streamsRows: (url: string) => unknown[] = () => []) {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (method === 'GET' && url.includes('/streams?')) return new Response(JSON.stringify(streamsRows(url)), { status: 200 });
        if (method === 'GET' && url.includes('schedule_channel_state?select=channel_id,tier')) return new Response('[]', { status: 200 });
        return new Response('', { status: 201 });
    }) as unknown as typeof fetch;
    return { db: new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn }), calls };
}

const chan = (i: number, p: Partial<RosterChannel> = {}): RosterChannel => ({
    channelId: `c${i}`, vtuberId: `v${i}`, platform: 'youtube', externalId: `UC${String(i).padStart(22, '0')}`, displayName: null, tier: 1, rssFailStreak: 0, ...p,
});
/** 依頻道 ID 回 /live 頁；live＝這些頻道正在直播 V{i} */
const ogFetch = (live: Set<string>, fail = new Set<string>()) =>
    (async (input: string | URL | Request) => {
        const url = String(input);
        const id = url.match(/UC\d{22}/)?.[0] ?? '';
        if (url.includes('i.ytimg.com')) return new Response(null, { status: 200 });
        if (fail.has(id)) return new Response('', { status: 503 });
        return new Response(live.has(id) ? page(`Vid${id.slice(-8)}`, '', id) : page(null, '', id), { status: 200 });
    }) as unknown as typeof fetch;

describe('ogSweep：輪替、下播兩輪確認、斷路器、去重', () => {
    it('直播中的頻道優先；同組內最久沒查的先查；抓取失敗的也更新查詢時間（輪替往下走）', async () => {
        const { db, calls } = fakeDb();
        const hit: string[] = [];
        const f = ogFetch(new Set(), new Set(['UC0000000000000000000002']));
        const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
            hit.push(String(input).match(/UC\d{22}/)?.[0] ?? '');
            return f(input, init);
        }) as unknown as typeof fetch;
        const stats = emptyStats('light', NOW);
        const chans = [chan(1, { ogCheckedAt: '2026-09-30T11:00:00Z' }), chan(2, { ogCheckedAt: '2026-09-30T10:00:00Z' }), chan(3, { ogCheckedAt: null }), chan(4)];
        const r = await ogSweep(db, chans, stats, NOW, { concurrency: 1, deadline: { at: Date.now() + 60_000 }, maxChannels: 3, fetch: fetchFn, liveFirst: new Set(['c1']) });
        expect(hit).toEqual(['UC0000000000000000000001', 'UC0000000000000000000003', 'UC0000000000000000000004']);
        expect(r.checked.map((c) => c.channelId)).toEqual(['c1', 'c3', 'c4']);
        const state = calls.find((c) => c.method === 'POST' && c.url.includes('schedule_channel_state'))!.body as { channel_id: string; og_checked_at: string }[];
        expect(state.map((s) => s.channel_id).sort()).toEqual(['c1', 'c3', 'c4']);
        expect(stats.og_failed).toBe(0);
    });

    it('第一次沒看到直播只記 miss，第二次才結束', async () => {
        const liveRow = stream({ id: 'a', channel_id: 'c1', external_id: 'Vid00000001', status: 'live' });
        const run = async (miss: number) => {
            const { db, calls } = fakeDb((url) => (url.includes('status=in.(scheduled,live)') ? [liveRow] : []));
            const stats = emptyStats('light', NOW);
            await ogSweep(db, [chan(1, { ogMissStreak: miss })], stats, NOW, { concurrency: 1, deadline: { at: Date.now() + 60_000 }, maxChannels: 10, fetch: ogFetch(new Set()) });
            const writes = calls.filter((c) => c.method === 'POST');
            return {
                ended: writes.some((c) => c.url.includes('/streams?') && (c.body as { status: string }[]).some((s) => s.status === 'ended')),
                miss: (writes.find((c) => c.url.includes('schedule_channel_state'))!.body as { og_miss_streak: number }[])[0].og_miss_streak,
            };
        };
        expect(await run(0)).toEqual({ ended: false, miss: 1 });
        expect(await run(1)).toEqual({ ended: true, miss: 0 });
    });

    it('斷路器：同一輪大量直播被判定結束（通常是 YouTube 回了異常頁面）→ 這輪不結束任何直播', async () => {
        const rows = Array.from({ length: 6 }, (_, i) => stream({ id: `s${i + 1}`, channel_id: `c${i + 1}`, external_id: `Vid0000000${i + 1}`, status: 'live' }));
        const { db, calls } = fakeDb((url) => (url.includes('status=in.(scheduled,live)') ? rows : []));
        const stats = emptyStats('light', NOW);
        const chans = Array.from({ length: 6 }, (_, i) => chan(i + 1, { ogMissStreak: 1 }));
        await ogSweep(db, chans, stats, NOW, { concurrency: 2, deadline: { at: Date.now() + 60_000 }, maxChannels: 10, fetch: ogFetch(new Set()) });
        expect(stats.og_end_suppressed).toBe(true);
        expect(stats.og_ended).toBe(0);
        expect(calls.some((c) => c.method === 'POST' && c.url.includes('/streams?'))).toBe(false);
    });

    it('兩個頻道指到同一支資料庫沒有的影片：只寫一筆（避免同一批 upsert 重複鍵整批失敗）', async () => {
        const { db, calls } = fakeDb();
        const shared = (async (input: string | URL | Request) => {
            const url = String(input);
            if (url.includes('i.ytimg.com')) return new Response(null, { status: 200 });
            const id = url.match(/UC\d{22}/)![0];
            return new Response(page('SharedLive1', '', id), { status: 200 });
        }) as unknown as typeof fetch;
        const stats = emptyStats('light', NOW);
        await ogSweep(db, [chan(1), chan(2)], stats, NOW, { concurrency: 1, deadline: { at: Date.now() + 60_000 }, maxChannels: 10, fetch: shared });
        const created = calls.filter((c) => c.method === 'POST' && c.url.includes('/streams?')).flatMap((c) => c.body as { external_id: string }[]);
        expect(created.map((r) => r.external_id)).toEqual(['SharedLive1']);
    });

    it('退回整頁比對（YouTube 改版徵兆）超過 OG_FULL_PAGE_MAX 頁就停止開始新的頁面', async () => {
        const { db } = fakeDb();
        // 測試頁沒有 canonical 也沒有 playerResponse 定義 → 每頁都退回整頁
        const stats = emptyStats('light', NOW);
        const chans = Array.from({ length: 15 }, (_, i) => chan(i + 1));
        await ogSweep(db, chans, stats, NOW, { concurrency: 1, deadline: { at: Date.now() + 60_000 }, maxChannels: 15, fetch: ogFetch(new Set()) });
        expect(stats.og_full_page).toBe(OG_FULL_PAGE_MAX);
        expect(stats.og_checked).toBe(OG_FULL_PAGE_MAX);
    });
});

describe('API 最後：重查待處理場次有呼叫上限，超過的留到下一輪', () => {
    it('上限 1 次（50 支）：只查前 50 支，其餘記在 api_deferred；失敗的請求也計數', async () => {
        const { db } = fakeDb();
        let calls = 0;
        const yt = new YouTubeClient({
            apiKey: 'k', referer: 'r', maxCalls: 1,
            fetch: (async () => {
                calls += 1;
                return new Response(JSON.stringify({ items: [] }), { status: 200 });
            }) as unknown as typeof fetch,
        });
        const stats = emptyStats('heavy', NOW);
        const pending = Array.from({ length: 70 }, (_, i) => stream({ id: `s${i}`, external_id: `Vid${String(i).padStart(8, '0')}` }));
        const updated = await refreshPending(db, yt, pending, stats, NOW);
        expect(calls).toBe(1);
        expect(updated).toHaveLength(50);
        expect(stats.api_deferred).toBe(20);

        const quota = new YouTubeClient({ apiKey: 'k', referer: 'r', fetch: (async () => new Response('{"error":{"errors":[{"reason":"quotaExceeded"}]}}', { status: 403 })) as unknown as typeof fetch });
        await expect(quota.listVideos(['AbCdEfGhIjK'])).rejects.toThrow(/HTTP 403/);
        expect(quota.quota.videosList).toBe(1);
        expect(quota.quotaExceeded).toBe(true);
    });
});

describe('code review 第二輪修正', () => {
    it('待機標記只看 ytInitialPlayerResponse：推薦影片區段的 isUpcoming／scheduledStartTime 不算', () => {
        const html = `${page(V)}<script>var ytInitialPlayerResponse = {"videoDetails":{"isLive":true}};</script><script>var ytInitialData = {"x":{"isUpcoming":true,"scheduledStartTime":"1790776800"}};</script>`;
        expect(parseLiveOgHtml(html).isUpcoming).toBe(false);
        const up = `${page(V)}<script>var ytInitialPlayerResponse = {"videoDetails":{"isUpcoming":true},"scheduledStartTime":"1790776800"};</script>`;
        expect(parseLiveOgHtml(up)).toMatchObject({ isUpcoming: true, scheduledStart: new Date(1790776800 * 1000).toISOString() });
    });

    it('頁面內容傳到一半卡住：逾時後當抓取失敗（不會讓整輪等到牆鐘上限）', async () => {
        const hang = (async (_input: string | URL | Request, init?: RequestInit) => {
            const body = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('<html>'));
                    init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
                },
            });
            return new Response(body, { status: 200 });
        }) as unknown as typeof fetch;
        expect((await detectLiveOg(UC, { fetch: hang, timeoutMs: 50 })).ok).toBe(false);
    });

    it('已過期的待機室：頁面沒給新時間或時間已過 3 小時 → 不改回 scheduled；給了未來時間 → 改回', () => {
        const expired = stream({ id: 'z', external_id: V, status: 'expired', scheduled_start: new Date(NOW - 10 * HOUR).toISOString() });
        expect(applyLiveOg(ch, ok({ isUpcoming: true, videoId: V }), [], expired, NOW).changed).toEqual([]);
        expect(applyLiveOg(ch, ok({ isUpcoming: true, videoId: V, scheduledStart: new Date(NOW - 5 * HOUR).toISOString() }), [], expired, NOW).changed).toEqual([]);
        expect(applyLiveOg(ch, ok({ isUpcoming: true, videoId: V, scheduledStart: new Date(NOW + HOUR).toISOString() }), [], expired, NOW).changed[0]).toMatchObject({ status: 'scheduled' });
    });

    it('直播中頻道很多時，保留名額給待機室（最多一半）', async () => {
        const { db } = fakeDb();
        const hit: string[] = [];
        const f = ogFetch(new Set());
        const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
            if (!String(input).includes('i.ytimg.com')) hit.push(String(input).match(/UC\d{22}/)![0]);
            return f(input, init);
        }) as unknown as typeof fetch;
        const chans = Array.from({ length: 10 }, (_, i) => chan(i + 1));
        const liveFirst = new Set(chans.slice(0, 8).map((c) => c.channelId));
        const r = await ogSweep(db, chans, emptyStats('light', NOW), NOW, { concurrency: 1, deadline: { at: Date.now() + 60_000 }, maxChannels: 6, reserveOthers: 20, fetch: fetchFn, liveFirst });
        expect(r.checked.map((c) => c.channelId)).toEqual(['c1', 'c2', 'c3', 'c4', 'c9', 'c10']);
    });

    it('斷路器有出口：已連續 3 輪沒看到直播的頻道照常結束', async () => {
        const rows = Array.from({ length: 6 }, (_, i) => stream({ id: `s${i + 1}`, channel_id: `c${i + 1}`, external_id: `Vid0000000${i + 1}`, status: 'live' }));
        const { db, calls } = fakeDb((url) => (url.includes('status=in.(scheduled,live)') ? rows : []));
        const stats = emptyStats('light', NOW);
        const chans = Array.from({ length: 6 }, (_, i) => chan(i + 1, { ogMissStreak: i < 2 ? 2 : 1 }));
        await ogSweep(db, chans, stats, NOW, { concurrency: 2, deadline: { at: Date.now() + 60_000 }, maxChannels: 10, fetch: ogFetch(new Set()) });
        expect(stats.og_end_suppressed).toBe(true);
        const ended = calls.filter((c) => c.method === 'POST' && c.url.includes('/streams?')).flatMap((c) => c.body as { id: string; status: string }[]).filter((s) => s.status === 'ended');
        expect(ended.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    });
});

describe('共享表：過時的直播不算直播中', () => {
    it('fetched_at 超過 2 小時的 live 場次 → is_live=false，改看待機室', async () => {
        const { buildLiveStatusRow } = await import('../../supabase/functions/_shared/live_status.ts');
        const stale = stream({ id: 'a', status: 'live', fetched_at: new Date(NOW - 3 * HOUR).toISOString() });
        const fresh = stream({ id: 'b', status: 'live', external_id: 'Fresh000001', fetched_at: new Date(NOW - HOUR).toISOString() });
        expect(buildLiveStatusRow({ externalId: UC }, [stale], NOW).is_live).toBe(false);
        expect(buildLiveStatusRow({ externalId: UC }, [stale, fresh], NOW)).toMatchObject({ is_live: true, video_id: 'Fresh000001' });
    });
});

describe('記憶體：擷取的字串不留住整頁', () => {
    it('detachString 內容不變；短字串原樣回傳', async () => {
        const { detachString } = await import('../../supabase/functions/_shared/strings.ts');
        const long = '【雜談】今晚一起聊聊最近玩的遊戲與生活近況 "quoted" \ back';
        expect(detachString(long)).toBe(long);
        expect(detachString('short')).toBe('short');
        expect(detachString(null)).toBeNull();
        expect(detachString(undefined)).toBeUndefined();
    });

    it('parseLiveOgHtml 的長標題與 RSS 欄位內容正確（複製後仍相同）', async () => {
        const title = '【雜談】今晚一起聊聊最近玩的遊戲與生活近況';
        expect(parseLiveOgHtml(`<meta property="og:image" content="https://i.ytimg.com/vi/${V}/hqdefault.jpg"><meta property="og:title" content="${title}">`).title).toBe(title);
        const { parseYouTubeRss } = await import('../../supabase/functions/_shared/rss.ts');
        const [e] = parseYouTubeRss(`<feed><entry><yt:videoId>${V}</yt:videoId><title>${title}</title><published>2026-09-30T10:00:00+00:00</published><updated>2026-09-30T10:05:00+00:00</updated></entry></feed>`);
        expect(e).toEqual({ videoId: V, title, publishedAt: '2026-09-30T10:00:00+00:00', updatedAt: '2026-09-30T10:05:00+00:00' });
    });
});
