// 出口流量瘦身第二輪（migration 20261009130000）：名冊依用途縮小＋欄式、共享表現況與 last_live_at 改 POST、
// snapshot 來源欄式。只攔 fetch（PostgREST、Storage），不 mock 自家模組。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Db, rowsFromColumnar } from '../../supabase/functions/_shared/db.ts';
import { loadRoster, loadRosterSlice } from '../../supabase/functions/_shared/roster.ts';
import { loadCurrentByChannelRpc, touchLastLiveAt } from '../../supabase/functions/_shared/sweep.ts';
import { publishSnapshot } from '../../supabase/functions/_shared/snapshot.ts';
import { emptyStats } from '../../supabase/functions/_shared/types.ts';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function fakeFetch(respond: (url: string, method: string, body: unknown) => Response) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = decodeURIComponent(String(input));
    const method = init?.method ?? 'GET';
    let body: unknown = null;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = String(init.body);
      }
    }
    calls.push({ url, method, body });
    return respond(url, method, body);
  }) as unknown as typeof fetch;
  return { fn, calls };
}
function fakeDb(respond: (url: string, method: string, body: unknown) => Response) {
  const { fn, calls } = fakeFetch(respond);
  return { db: new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fn }), calls };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-range': '0-0/0' } });
const empty = (status = 200) => new Response('', { status, headers: { 'content-range': '0-0/0' } });
const isRpc = (c: Call, fn: string) => c.method === 'POST' && c.url.endsWith(`/rest/v1/rpc/${fn}`);

const YT_COLS = ['id', 'vtuber_id', 'external_id', 'tier', 'rss_fail_streak', 'last_new_video_at', 'og_checked_at', 'og_miss_streak'];

describe('rowsFromColumnar', () => {
  it('欄式轉物件；物件陣列原樣；null 回空；格式不對丟錯', () => {
    expect(rowsFromColumnar({ cols: ['a', 'b'], rows: [[1, null], [2, 'x']] })).toEqual([{ a: 1, b: null }, { a: 2, b: 'x' }]);
    expect(rowsFromColumnar([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(rowsFromColumnar(null)).toEqual([]);
    expect(() => rowsFromColumnar({ foo: 1 })).toThrow();
  });
});

describe('loadRosterSlice（schedule_roster_v2）', () => {
  it('YouTube 分片：參數原樣送出、欄式轉回 RosterChannel、帶回 total／start', async () => {
    const { db, calls } = fakeDb(() =>
      json({ total: 1538, start: 38, cols: YT_COLS, rows: [['c1', 'v1', 'UC1', 1, 2, '2026-10-01T00:00:00+00:00', null, 1], ['c2', 'v2', 'UC2', null, null, null, null, null]] }),
    );
    const r = await loadRosterSlice(db, { platform: 'youtube', tier: 1, offset: 1538 + 38, limit: 500 });
    expect(calls).toHaveLength(1);
    expect(isRpc(calls[0], 'schedule_roster_v2')).toBe(true);
    expect(calls[0].body).toEqual({ p_platform: 'youtube', p_tier: 1, p_channel_ids: null, p_offset: 1576, p_limit: 500 });
    expect(r.total).toBe(1538);
    expect(r.start).toBe(38);
    expect(r.channels).toEqual([
      { channelId: 'c1', vtuberId: 'v1', platform: 'youtube', externalId: 'UC1', displayName: null, tier: 1, rssFailStreak: 2, ogCheckedAt: null, ogMissStreak: 1, lastNewVideoAt: '2026-10-01T00:00:00+00:00' },
      { channelId: 'c2', vtuberId: 'v2', platform: 'youtube', externalId: 'UC2', displayName: null, tier: null, rssFailStreak: 0, ogCheckedAt: null, ogMissStreak: 0, lastNewVideoAt: null },
    ]);
  });

  it('指定頻道：p_channel_ids 送陣列；Twitch 只有三欄也能轉', async () => {
    const { db, calls } = fakeDb(() => json({ total: 1, start: 0, cols: ['id', 'vtuber_id', 'external_id'], rows: [['t1', 'v9', '123']] }));
    const r = await loadRosterSlice(db, { platform: 'twitch', channelIds: ['t1'] });
    expect(calls[0].body).toMatchObject({ p_platform: 'twitch', p_channel_ids: ['t1'], p_offset: null, p_limit: null });
    expect(r.channels[0]).toMatchObject({ channelId: 't1', vtuberId: 'v9', platform: 'twitch', externalId: '123', tier: null });
  });

  it('RPC 回 null 一律丟錯（空名冊不能當成「沒有頻道」，否則清孤兒預告會全部取消）', async () => {
    const { db } = fakeDb(() => empty(200));
    await expect(loadRosterSlice(db, { platform: 'twitch' })).rejects.toThrow();
    await expect(loadRoster(db, 'twitch')).rejects.toThrow();
  });
});

describe('共享表現況與 last_live_at 改 POST', () => {
  it('loadCurrentByChannelRpc：一個 POST、沒有 channel_id=in.( 的 GET，欄式依頻道分組；空清單不發請求', async () => {
    const cols = ['id', 'vtuber_id', 'channel_id', 'platform', 'external_id', 'status'];
    const { db, calls } = fakeDb(() => json({ cols, rows: [['s1', 'v1', 'c1', 'youtube', 'A', 'live'], ['s2', 'v1', 'c1', 'youtube', 'B', 'scheduled'], ['s3', 'v2', 'c2', 'youtube', 'C', 'scheduled']] }));
    const m = await loadCurrentByChannelRpc(db, ['c1', 'c2']);
    expect(calls).toHaveLength(1);
    expect(isRpc(calls[0], 'schedule_current_streams')).toBe(true);
    expect(calls[0].body).toEqual({ p_channel_ids: ['c1', 'c2'] });
    expect(m.get('c1')?.map((s) => s.external_id)).toEqual(['A', 'B']);
    expect(m.get('c2')?.map((s) => s.external_id)).toEqual(['C']);
    const { db: db2, calls: calls2 } = fakeDb(() => json(null));
    expect((await loadCurrentByChannelRpc(db2, [])).size).toBe(0);
    expect(calls2).toHaveLength(0);
  });

  it('touchLastLiveAt：去重後一個 RPC、筆數計入 stats；空清單不發請求', async () => {
    const { db, calls } = fakeDb(() => json(2));
    const stats = emptyStats('live', NOW);
    await touchLastLiveAt(db, ['v1', 'v2', 'v1'], stats, NOW);
    expect(calls).toHaveLength(1);
    expect(isRpc(calls[0], 'schedule_touch_last_live')).toBe(true);
    expect(calls[0].body).toEqual({ p_ids: ['v1', 'v2'], p_now: iso(NOW) });
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(stats.last_live_at_updated).toBe(2);
    const { db: db2, calls: calls2 } = fakeDb(() => json(0));
    await touchLastLiveAt(db2, [], stats, NOW);
    expect(calls2).toHaveLength(0);
  });
});

describe('snapshot 來源欄式', () => {
  it('欄式來源組出與物件格式相同的 snapshot；合作依台北日期篩選', async () => {
    const scols = ['id', 'vtuber_id', 'platform', 'external_id', 'source', 'status', 'scheduled_start', 'actual_start', 'actual_end', 'title', 'category', 'is_schedule_frame', 'fetched_at', 'merged_with'];
    const source = {
      active: { cols: scols, rows: [['s1', 'v1', 'youtube', 'LiveVideo01', 'yt_waiting_room', 'live', null, iso(NOW - 3_600_000), null, '雜談', null, false, iso(NOW), null]] },
      ended: { cols: scols, rows: [] },
      vtubers: { cols: ['id', 'name', 'img_url', 'nationality', 'group_id', 'youtube_channel_id', 'twitch_channel_id', 'slug'], rows: [['v1', '甲', null, 'TW', 'g1', 'UC1', null, 'jia']] },
      groups: { cols: ['id', 'name', 'kind', 'parent_id'], rows: [['g1', '公司A', 'agency', null], ['g2', '公司B', 'agency', null], ['g3', '公司C', 'agency', null]] },
      // 台北日期 2026-10-09：g2 已開始未結束 → 算；g3 明天才開始 → 不算
      links: { cols: ['vtuber_id', 'group_id', 'since', 'until'], rows: [['v1', 'g2', '2026-10-09', null], ['v1', 'g3', '2026-10-10', null]] },
    };
    const { db, calls } = fakeDb((url, method) => {
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_check')) return json({ changed: true, fingerprint: 'fp@1' });
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_source')) return json(source);
      if (method === 'POST' && url.includes('/storage/v1/object/')) return json({});
      return empty(204);
    });
    const bytes = await publishSnapshot(db, NOW, null);
    expect(bytes).toBeGreaterThan(0);
    const up = calls.find((c) => c.url.includes('/storage/v1/object/'))!.body as { live: unknown[]; channels: Record<string, unknown>; agencies: string[] };
    expect(up.live).toEqual([{ vtuber_id: 'v1', platform: 'youtube', external_id: 'LiveVideo01', source: 'yt_waiting_room', status: 'live', title: '雜談', actual_start: iso(NOW - 3_600_000) }]);
    expect(up.channels.v1).toEqual({ name: '甲', group: '公司A', agency: '公司A', collabs: ['公司B'], nationality: 'TW', youtube: 'UC1', slug: 'jia' });
    expect(up.agencies).toEqual(['公司A', '公司B', '公司C']);
    expect(calls.filter((c) => isRpc(c, 'schedule_snapshot_mark')).map((c) => c.body)).toEqual([{ p_fingerprint: 'fp@1' }]);
  });
});

describe('排程名冊只取需要的頻道（整支 handler）', () => {
  const g = globalThis as unknown as { Deno?: unknown };
  const prevDeno = g.Deno;
  afterEach(() => {
    vi.unstubAllGlobals();
    g.Deno = prevDeno;
  });

  type Handler = (req: Request) => Promise<Response>;
  // Deno.serve 只在模組第一次 import 時呼叫：handler 依函式名稱留著，之後的測試重用（env 每次重設）
  const handlers = new Map<string, Handler>();
  async function handlerFor(name: 'schedule-light' | 'schedule-heavy'): Promise<Handler> {
    const env: Record<string, string> = { SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'svc', YOUTUBE_API_KEY: 'yk', TWITCH_CLIENT_ID: 'tid', TWITCH_CLIENT_SECRET: 'tsec' };
    let served: Handler | null = null;
    g.Deno = { serve: (h: Handler) => { served = h; }, env: { get: (k: string) => env[k] } };
    if (!handlers.has(name)) {
      if (name === 'schedule-light') await import('../../supabase/functions/schedule-light/index.ts');
      else await import('../../supabase/functions/schedule-heavy/index.ts');
      handlers.set(name, served!);
    }
    return handlers.get(name)!;
  }

  /** shards：job → cursor_position／shard_size／last_run_stats；roster：依 p_platform 與 p_offset 回應 */
  function stubFetch(shards: Record<string, { cursor_position: number; shard_size: number; last_run_stats?: unknown }>, roster: (body: Record<string, unknown>) => unknown) {
    const { fn, calls } = fakeFetch((url, method, body) => {
      if (url.includes('oauth2/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 });
      if (url.includes('api.twitch.tv')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      if (method === 'POST' && url.includes('/rpc/schedule_roster_v2')) return json(roster(body as Record<string, unknown>));
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_check')) return json({ changed: false, fingerprint: 'fp' });
      if (method === 'POST' && url.includes('/rpc/schedule_merge_check')) return json({ changed: false, fingerprint: 'fp' });
      if (method === 'POST' && url.includes('/rpc/')) return json(null);
      if (method === 'GET' && url.includes('/rest/v1/cron_shard_state?')) {
        const job = /job_name=eq\.([a-z_]+)/.exec(url)?.[1] ?? '';
        const s = shards[job] ?? { cursor_position: 0, shard_size: 100 };
        return json([{ job_name: job, cursor_position: s.cursor_position, shard_size: s.shard_size, total_items: 0, last_run_at: null, last_run_stats: s.last_run_stats ?? null }]);
      }
      if (method === 'GET') return json([]);
      return empty(200);
    });
    vi.stubGlobal('fetch', fn);
    return calls;
  }
  const rosterCalls = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && /\/rpc\/schedule_roster(_v2)?$/.test(c.url));
  const call = async (fn: 'schedule-light' | 'schedule-heavy') =>
    (await handlerFor(fn))(new Request(`http://localhost/functions/v1/${fn}`, { method: 'POST', headers: { Authorization: 'Bearer svc' } }));

  it('schedule-light：T1 只取游標這一片（p_tier=1、p_offset／p_limit），Twitch 取全部；不讀全名冊', async () => {
    const calls = stubFetch({ schedule_light_rss: { cursor_position: 700, shard_size: 500 } }, (b) =>
      b.p_platform === 'youtube' ? { total: 1538, start: 700, cols: YT_COLS, rows: [] } : { total: 0, start: 0, cols: ['id', 'vtuber_id', 'external_id'], rows: [] },
    );
    const res = await call('schedule-light');
    const stats = (await res.json()) as { channels_total: number; errors: string[] };
    expect(stats.errors).toEqual([]);
    expect(stats.channels_total).toBe(1538);
    expect(rosterCalls(calls).map((c) => c.body)).toEqual([
      { p_platform: 'youtube', p_tier: 1, p_channel_ids: null, p_offset: 700, p_limit: 500 },
      { p_platform: 'twitch', p_tier: null, p_channel_ids: null, p_offset: null, p_limit: null },
    ]);
    // 游標：這片 0 個頻道 → advance 0，存回 700 % 1538
    const save = calls.find((c) => c.method === 'PATCH' && c.url.includes('cron_shard_state?job_name=eq.schedule_light_rss'));
    expect(save?.body).toMatchObject({ cursor_position: 700, total_items: 1538 });
  });

  it('schedule-heavy：不是新的一圈 → 只取 YouTube 與 Twitch 各一片，不讀全名冊', async () => {
    const calls = stubFetch(
      { schedule_heavy_rss: { cursor_position: 100, shard_size: 400 }, schedule_twitch: { cursor_position: 3, shard_size: 250 } },
      (b) => (b.p_platform === 'youtube' ? { total: 1000, start: 100, cols: YT_COLS, rows: [] } : { total: 600, start: 3, cols: ['id', 'vtuber_id', 'external_id'], rows: [] }),
    );
    const res = await call('schedule-heavy');
    const stats = (await res.json()) as { errors: string[]; new_lap: boolean };
    expect(stats.errors).toEqual([]);
    expect(stats.new_lap).toBe(false);
    expect(rosterCalls(calls).map((c) => c.body)).toEqual([
      { p_platform: 'youtube', p_tier: null, p_channel_ids: null, p_offset: 100, p_limit: 400 },
      { p_platform: 'twitch', p_tier: null, p_channel_ids: null, p_offset: 3, p_limit: 250 },
    ]);
  });

  it('schedule-heavy：新的一圈 → 另讀全部 YouTube（重算分級）；Twitch 片跨過開頭 → 另讀全部 Twitch（清孤兒預告）', async () => {
    const calls = stubFetch(
      { schedule_heavy_rss: { cursor_position: 0, shard_size: 400 }, schedule_twitch: { cursor_position: 500, shard_size: 250 } },
      (b) => {
        if (b.p_platform === 'youtube') return { total: 1000, start: b.p_offset == null ? 0 : 0, cols: YT_COLS, rows: [] };
        return { total: 600, start: b.p_offset == null ? 0 : 500, cols: ['id', 'vtuber_id', 'external_id'], rows: [] };
      },
    );
    const res = await call('schedule-heavy');
    const stats = (await res.json()) as { errors: string[]; new_lap: boolean };
    expect(stats.errors).toEqual([]);
    expect(stats.new_lap).toBe(true);
    expect(rosterCalls(calls).map((c) => c.body)).toEqual([
      { p_platform: 'youtube', p_tier: null, p_channel_ids: null, p_offset: 0, p_limit: 400 },
      { p_platform: 'youtube', p_tier: null, p_channel_ids: null, p_offset: null, p_limit: null },
      { p_platform: 'twitch', p_tier: null, p_channel_ids: null, p_offset: 500, p_limit: 250 },
      { p_platform: 'twitch', p_tier: null, p_channel_ids: null, p_offset: null, p_limit: null },
    ]);
  });
});
