// live-og（/live 頁）：HTML 解析、偵測（抓取失敗與「沒有直播」分開）、場次狀態轉移，以及 live-og 為主、API 有上限的流程
import { describe, expect, it } from 'vitest';
import { applyLiveOg, detectLiveOg, extractVideoId, parseLiveOgHtml, type LiveOgResult } from '../../supabase/functions/_shared/live_og.ts';
import { ogSweep, refreshPending } from '../../supabase/functions/_shared/sweep.ts';
import { Db } from '../../supabase/functions/_shared/db.ts';
import { YouTubeClient } from '../../supabase/functions/_shared/youtube.ts';
import { emptyStats, type RosterChannel, type StreamRecord } from '../../supabase/functions/_shared/types.ts';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const HOUR = 3_600_000;
const UC = 'UCabcdefghijklmnopqrstuv';
const V = 'LiveVideo01';

const page = (videoId: string | null, extra = '') =>
    `<html><head>${videoId ? `<meta property="og:image" content="https://i.ytimg.com/vi/${videoId}/maxresdefault_live.jpg">` : '<meta property="og:image" content="https://yt3.ggpht.com/avatar">'}<meta property="og:title" content="今晚雜談"></head><body>${extra}</body></html>`;

function fakeFetch(opts: { status?: number; html?: string; head?: number; throws?: boolean }) {
    const calls: string[] = [];
    const fn = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        if (opts.throws) throw new Error('network');
        if (url.includes('i.ytimg.com')) return new Response(null, { status: opts.head ?? 404 });
        return new Response(opts.html ?? '', { status: opts.status ?? 200 });
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
    it('videoId 四來源：og:image、canonical、og:url、_live.jpg', () => {
        expect(extractVideoId(page(V))).toBe(V);
        expect(extractVideoId(`<link rel="canonical" href="https://www.youtube.com/watch?v=${V}">`)).toBe(V);
        expect(extractVideoId(`<meta property="og:url" content="https://www.youtube.com/watch?v=${V}">`)).toBe(V);
        expect(extractVideoId(`x https://i.ytimg.com/vi/${V}/hqdefault_live.jpg y`)).toBe(V);
        expect(extractVideoId(page(null))).toBeNull();
    });

    it('待機室：UPCOMING 標記與預定時間（epoch 秒轉 ISO）', () => {
        const r = parseLiveOgHtml(page(V, '"status":"UPCOMING","scheduledStartTime":"1790776800"'));
        expect(r).toMatchObject({ videoId: V, isUpcoming: true, scheduledStart: new Date(1790776800 * 1000).toISOString(), title: '今晚雜談' });
    });
});

describe('live-og：偵測', () => {
    it('非待機且 _live.jpg 存在 → 直播中', async () => {
        const f = fakeFetch({ html: page(V), head: 200 });
        const r = await detectLiveOg(UC, { fetch: f.fn });
        expect(r).toMatchObject({ ok: true, isLive: true, videoId: V });
        expect(f.calls[0]).toContain(`/channel/${UC}/live`);
        expect(f.calls[1]).toMatch(/^HEAD https:\/\/i\.ytimg\.com/);
    });

    it('待機室不發 HEAD；頁面沒有影片 → 沒有直播（ok）', async () => {
        const up = fakeFetch({ html: page(V, '"isUpcoming":true') });
        expect(await detectLiveOg(UC, { fetch: up.fn })).toMatchObject({ ok: true, isUpcoming: true, isLive: false });
        expect(up.calls).toHaveLength(1);
        expect(await detectLiveOg(UC, { fetch: fakeFetch({ html: page(null) }).fn })).toMatchObject({ ok: true, isLive: false, videoId: null });
        // 有影片但 _live.jpg 不存在（已下播的影片）→ 沒有直播
        expect(await detectLiveOg(UC, { fetch: fakeFetch({ html: page(V), head: 404 }).fn })).toMatchObject({ ok: true, isLive: false });
    });

    it('抓取失敗（非 200、例外、頻道 ID 格式不對）→ ok=false，不能當成下播', async () => {
        expect((await detectLiveOg(UC, { fetch: fakeFetch({ status: 500 }).fn })).ok).toBe(false);
        expect((await detectLiveOg(UC, { fetch: fakeFetch({ throws: true }).fn })).ok).toBe(false);
        expect((await detectLiveOg('not-a-channel', { fetch: fakeFetch({}).fn })).ok).toBe(false);
    });
});

describe('live-og：場次狀態轉移（applyLiveOg）', () => {
    it('待機室開播：scheduled → live，記開播時間；同頻道其他 live 場次 → ended', () => {
        const cur = [stream({ id: 'a', external_id: V, scheduled_start: new Date(NOW - HOUR).toISOString() }), stream({ id: 'b', external_id: 'OldLive0001', status: 'live', actual_start: '2026-09-30T08:00:00Z' })];
        const r = applyLiveOg(ch, ok({ isLive: true, videoId: V, title: '開台' }), cur, undefined, NOW);
        const a = r.changed.find((s) => s.id === 'a')!;
        expect(a).toMatchObject({ status: 'live', actual_start: new Date(NOW).toISOString(), title: '開台', viewer_count: null });
        expect(r.changed.find((s) => s.id === 'b')).toMatchObject({ status: 'ended', actual_end: new Date(NOW).toISOString() });
        expect(r).toMatchObject({ live: 1, ended: 1 });
    });

    it('資料庫沒有的直播（RSS 還沒掃到）→ 新增 live 場次', () => {
        const r = applyLiveOg(ch, ok({ isLive: true, videoId: V, title: '突發直播' }), [], undefined, NOW);
        expect(r.created).toEqual([expect.objectContaining({ external_id: V, status: 'live', vtuber_id: 'v1', channel_id: 'c1', source: 'yt_waiting_room', title: '突發直播' })]);
    });

    it('改期：待機室的預定時間跟著更新；已結束的影片又出現待機 → 回到 scheduled', () => {
        const newTime = new Date(NOW + 5 * HOUR).toISOString();
        const r = applyLiveOg(ch, ok({ isUpcoming: true, videoId: V, scheduledStart: newTime }), [stream({ id: 'a', external_id: V, scheduled_start: new Date(NOW + HOUR).toISOString() })], undefined, NOW);
        expect(r.changed[0]).toMatchObject({ status: 'scheduled', scheduled_start: newTime, is_schedule_frame: false });
        const again = applyLiveOg(ch, ok({ isUpcoming: true, videoId: V, scheduledStart: newTime }), [], stream({ id: 'z', external_id: V, status: 'expired' }), NOW);
        expect(again.changed[0]).toMatchObject({ id: 'z', status: 'scheduled' });
    });

    it('沒有直播也沒有待機：live 的 → ended；過期 3 小時的 scheduled → expired；還沒過期的不動', () => {
        const cur = [
            stream({ id: 'a', external_id: 'LiveNow0001', status: 'live' }),
            stream({ id: 'b', external_id: 'Late0000001', scheduled_start: new Date(NOW - 4 * HOUR).toISOString() }),
            stream({ id: 'c', external_id: 'Soon0000001', scheduled_start: new Date(NOW + HOUR).toISOString() }),
        ];
        const r = applyLiveOg(ch, ok({}), cur, undefined, NOW);
        expect(r.changed.map((s) => `${s.id}:${s.status}`)).toEqual(['a:ended', 'b:expired']);
    });

    it('抓取失敗：什麼都不改', () => {
        const r = applyLiveOg(ch, { ...ok({}), ok: false }, [stream({ status: 'live' })], undefined, NOW);
        expect(r.changed).toEqual([]);
        expect(r.created).toEqual([]);
    });
});

/** 記錄 PostgREST 請求的假 Db */
function fakeDb(respond: (url: string, init?: RequestInit) => Response) {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
        return respond(url, init);
    }) as unknown as typeof fetch;
    return { db: new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn }), calls };
}

describe('ogSweep：直播中的頻道優先、有頻道上限、失敗的頻道不寫', () => {
    const chan = (i: number): RosterChannel => ({ channelId: `c${i}`, vtuberId: `v${i}`, platform: 'youtube', externalId: `UC${String(i).padStart(22, '0')}`, displayName: null, tier: 1, rssFailStreak: 0 });

    it('maxChannels 限制下，liveFirst 的頻道先查；抓取失敗的頻道不回傳為 checked', async () => {
        const { db, calls } = fakeDb((url) => (url.includes('/streams?') ? new Response('[]', { status: 200 }) : new Response('', { status: 201 })));
        const hit: string[] = [];
        const fetchFn = (async (input: string | URL | Request) => {
            const url = String(input);
            hit.push(url);
            if (url.includes('UC0000000000000000000002')) return new Response('', { status: 503 });
            return new Response(page(null), { status: 200 });
        }) as unknown as typeof fetch;
        const stats = emptyStats('light', NOW);
        const r = await ogSweep(db, [chan(1), chan(2), chan(3)], stats, NOW, { concurrency: 1, deadline: { at: Date.now() + 60_000 }, maxChannels: 2, fetch: fetchFn, liveFirst: new Set(['c2', 'c3']) });
        expect(hit.map((u) => u.match(/UC\d+/)?.[0])).toEqual(['UC0000000000000000000002', 'UC0000000000000000000003']);
        expect(stats).toMatchObject({ og_checked: 2, og_failed: 1 });
        expect(r.checked.map((c) => c.channelId)).toEqual(['c3']);
        // 沒有任何變化時不寫 streams
        expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    });
});

describe('API 最後：重查待處理場次有呼叫上限，超過的留到下一輪', () => {
    it('上限 1 次（50 支）：只查前 50 支，其餘記在 api_deferred', async () => {
        const { db } = fakeDb(() => new Response('', { status: 201 }));
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
    });
});
