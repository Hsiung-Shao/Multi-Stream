// 排程 Edge Functions 出口流量瘦身：大量回讀改成資料庫端 RPC（POST /rest/v1/rpc/<fn>）。
// 只攔 fetch（PostgREST、Storage、YouTube、Twitch），不 mock 自家模組。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Db } from '../../supabase/functions/_shared/db.ts';
import { loadRoster, recomputeTiers } from '../../supabase/functions/_shared/roster.ts';
import { classifyNewVideos, syncTwitchSchedule, writeChannelStates, type Candidate } from '../../supabase/functions/_shared/sweep.ts';
import { publishSnapshot } from '../../supabase/functions/_shared/snapshot.ts';
import { TwitchClient } from '../../supabase/functions/_shared/twitch.ts';
import { YouTubeClient } from '../../supabase/functions/_shared/youtube.ts';
import { emptyStats, type RosterChannel } from '../../supabase/functions/_shared/types.ts';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3_600_000;
const DAY = 86_400_000;

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** 記錄每次請求的假 Db；respond 依 (網址, method, body) 回應 */
function fakeDb(respond: (url: string, method: string, body: unknown) => Response) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
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
  return { db: new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn }), calls };
}

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-range': '0-0/0' } });
const empty = (status = 201) => new Response('', { status, headers: { 'content-range': '0-0/0' } });
const isRpc = (c: Call, fn: string) => c.method === 'POST' && c.url.includes(`/rest/v1/rpc/${fn}`);
const getsOf = (calls: Call[], table: string) => calls.filter((c) => c.method === 'GET' && c.url.includes(`/rest/v1/${table}?`));

function ytChannel(i: number, p: Partial<RosterChannel> = {}): RosterChannel {
  return {
    channelId: `c${i}`,
    vtuberId: `v${i}`,
    platform: 'youtube',
    externalId: `UC${String(i).padStart(22, '0')}`,
    displayName: null,
    tier: 2,
    rssFailStreak: 0,
    ...p,
  };
}

describe('T1 名冊一次請求取回', () => {
  const rpcRows = [
    {
      id: 'c1', vtuber_id: 'v1', platform: 'youtube', external_id: 'UC0000000000000000000001', display_name: 'A',
      tier: 1, rss_fail_streak: 3, last_new_video_at: '2026-10-01T00:00:00Z', og_checked_at: '2026-10-09T11:00:00Z', og_miss_streak: 1,
    },
    {
      // 沒有 schedule_channel_state 的新頻道：tier 等 state 欄位為 null
      id: 'c2', vtuber_id: 'v2', platform: 'youtube', external_id: 'UC0000000000000000000002', display_name: null,
      tier: null, rss_fail_streak: null, last_new_video_at: null, og_checked_at: null, og_miss_streak: null,
    },
  ];
  function db() {
    return fakeDb((url, method) => {
      if (method === 'POST' && url.includes('/rpc/schedule_roster')) return json(rpcRows);
      return json([]); // 舊路徑（GET vtuber_channels／schedule_channel_state）
    });
  }

  it('指定平台：只發 1 個 POST rpc/schedule_roster（p_platform=youtube），不 GET vtuber_channels 與 schedule_channel_state', async () => {
    const { db: d, calls } = db();
    const roster = await loadRoster(d, 'youtube');
    expect(calls).toHaveLength(1);
    expect(isRpc(calls[0], 'schedule_roster')).toBe(true);
    expect(calls[0].body).toEqual({ p_platform: 'youtube' });
    expect(getsOf(calls, 'vtuber_channels')).toHaveLength(0);
    expect(getsOf(calls, 'schedule_channel_state')).toHaveLength(0);
    // 欄位對應：tier null 保留 null、缺值給預設、新增 lastNewVideoAt
    expect(roster).toEqual([
      {
        channelId: 'c1', vtuberId: 'v1', platform: 'youtube', externalId: 'UC0000000000000000000001', displayName: 'A',
        tier: 1, rssFailStreak: 3, ogCheckedAt: '2026-10-09T11:00:00Z', ogMissStreak: 1, lastNewVideoAt: '2026-10-01T00:00:00Z',
      },
      {
        channelId: 'c2', vtuberId: 'v2', platform: 'youtube', externalId: 'UC0000000000000000000002', displayName: null,
        tier: null, rssFailStreak: 0, ogCheckedAt: null, ogMissStreak: 0, lastNewVideoAt: null,
      },
    ]);
  });

  it('不指定平台：p_platform 送 null', async () => {
    const { db: d, calls } = db();
    await loadRoster(d);
    expect(calls).toHaveLength(1);
    expect(isRpc(calls[0], 'schedule_roster')).toBe(true);
    expect(calls[0].body).toEqual({ p_platform: null });
  });
});

describe('T2 重算分級不重讀 state', () => {
  it('last_new_video_at 取自名冊的 lastNewVideoAt：不 GET schedule_channel_state，5 天前有新影片 → T1', async () => {
    const { db, calls } = fakeDb((url, method) => (method === 'GET' ? json([]) : empty()));
    const recent = ytChannel(1, { lastNewVideoAt: iso(NOW - 5 * DAY) } as Partial<RosterChannel>);
    const stale = ytChannel(2, { lastNewVideoAt: null } as Partial<RosterChannel>);
    const r = await recomputeTiers(db, [recent, stale], NOW);
    expect(getsOf(calls, 'schedule_channel_state')).toHaveLength(0);
    // metrics、vtubers activity、upsert 照舊
    expect(getsOf(calls, 'vtubers').length).toBeGreaterThan(0);
    const upsert = calls.find((c) => c.method === 'POST' && c.url.includes('/rest/v1/schedule_channel_state?'));
    const rows = upsert?.body as { channel_id: string; tier: number; tier_reason: string }[];
    expect(rows.find((x) => x.channel_id === 'c1')).toMatchObject({ tier: 1, tier_reason: 'rss_new_video_30d' });
    expect(rows.find((x) => x.channel_id === 'c2')).toMatchObject({ tier: 2, tier_reason: 'no_metrics' });
    expect(r.counts).toEqual({ 1: 1, 2: 1, 3: 0 });
  });
});

describe('T4 新影片判斷改用 RPC', () => {
  it('候選 id 全部送 rpc/schedule_unseen_video_ids，只有回應中的 id 進 videos.list；沒有 channel_id=in.( 的 GET', async () => {
    const { db, calls } = fakeDb((url, method) => {
      if (method === 'POST' && url.includes('/rpc/schedule_unseen_video_ids')) return json(['NewVideo001']);
      if (method === 'GET') return json([]); // 舊路徑：什麼都沒看過 → 兩支都會被送 videos.list
      return empty();
    });
    const requested: string[] = [];
    const yt = new YouTubeClient({
      apiKey: 'k', referer: 'r',
      fetch: (async (input: string | URL | Request) => {
        const ids = new URL(String(input)).searchParams.get('id') ?? '';
        requested.push(...ids.split(',').filter(Boolean));
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const ch = ytChannel(1);
    const entry = (videoId: string) => ({ videoId, publishedAt: iso(NOW - HOUR) }) as Candidate['entry'];
    const candidates = new Map<string, Candidate>([
      ['OldVideo001', { channel: ch, entry: entry('OldVideo001') }],
      ['NewVideo001', { channel: ch, entry: entry('NewVideo001') }],
    ]);
    const stats = emptyStats('light', NOW);
    await classifyNewVideos(db, yt, candidates, stats, NOW);

    const rpc = calls.filter((c) => isRpc(c, 'schedule_unseen_video_ids'));
    expect(rpc).toHaveLength(1);
    expect(((rpc[0].body as { p_ids: string[] }).p_ids).slice().sort()).toEqual(['NewVideo001', 'OldVideo001']);
    expect(calls.filter((c) => c.method === 'GET' && c.url.includes('channel_id=in.('))).toHaveLength(0);
    expect(requested).toEqual(['NewVideo001']);
    expect(stats.new_video_candidates).toBe(1);
  });
});

describe('T5 狀態寫入改用 RPC（保留 tier 交給資料庫）', () => {
  it('只發 1 個 rpc/schedule_upsert_channel_states，p_rows 原樣送出；不 GET schedule_channel_state', async () => {
    const { db, calls } = fakeDb((url, method) => (method === 'GET' ? json([{ channel_id: 'c1', tier: 3 }]) : empty(200)));
    const updates = [
      { channel_id: 'c1', rss_fail_streak: 0, rss_last_ok_at: 'T', rss_last_error: null, last_checked_at: 'T' },
      { channel_id: 'c2', rss_fail_streak: 2, rss_last_error: 'timeout', last_checked_at: 'T' },
    ];
    await writeChannelStates(db, updates);
    expect(calls).toHaveLength(1);
    expect(isRpc(calls[0], 'schedule_upsert_channel_states')).toBe(true);
    expect(calls[0].body).toEqual({ p_rows: updates });
    expect(getsOf(calls, 'schedule_channel_state')).toHaveLength(0);
  });

  it('updates 為空陣列時不發任何請求', async () => {
    const { db, calls } = fakeDb(() => empty());
    await writeChannelStates(db, []);
    expect(calls).toHaveLength(0);
  });
});

describe('T6 Twitch 週表批次 reconcile', () => {
  it('不逐頻道 GET streams；整輪一次 rpc/schedule_twitch_reconcile，限速與失敗的頻道不放進 p_items；取消筆數計入 stats', async () => {
    const seg = (id: string, ms: number) => ({ id, start_time: iso(ms), end_time: null, title: id, category: null, canceled_until: null, is_recurring: false });
    const twitchFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('oauth2/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 });
      const u = new URL(url);
      const id = u.searchParams.get('broadcaster_id');
      const after = u.searchParams.get('after');
      if (id === 'b1') return new Response(JSON.stringify({ data: { segments: [seg('s1', NOW + HOUR)] } }), { status: 200 });
      if (id === 'b2') return new Response('{"status":404}', { status: 404 }); // 沒有週表 → keep 為空
      if (id === 'b4') {
        // 每頁都有下一頁：翻到上限（4 頁）→ coveredUntil＝最後一段
        const n = after ? Number(after.slice(1)) : 1;
        return new Response(JSON.stringify({ data: { segments: [seg(`p${n}`, NOW + n * HOUR)] }, pagination: { cursor: `n${n + 1}` } }), { status: 200 });
      }
      if (id === 'b3') return new Response('boom', { status: 500 }); // 失敗
      return new Response('slow down', { status: 429 }); // b5：限速
    }) as unknown as typeof fetch;
    const { db, calls } = fakeDb((url, method) => {
      if (method === 'POST' && url.includes('/rpc/schedule_twitch_reconcile')) return json(3);
      if (method === 'GET') return json([{ id: 'old-row', external_id: 'gone-seg' }]); // 舊路徑：每個頻道都有一筆會被取消
      return empty(200);
    });
    const twitch = new TwitchClient({ clientId: 'id', clientSecret: 's', db: null, fetch: twitchFetch });
    const mk = (id: string): RosterChannel => ({ channelId: `c-${id}`, vtuberId: `v-${id}`, platform: 'twitch', externalId: id, displayName: null, tier: null, rssFailStreak: 0 });
    const stats = emptyStats('heavy', NOW);
    await syncTwitchSchedule(db, twitch, [mk('b1'), mk('b2'), mk('b4'), mk('b3'), mk('b5')], {
      concurrency: 1,
      deadline: { at: Date.now() + 60_000 },
      stats,
      now: NOW,
    });

    expect(calls.filter((c) => c.method === 'GET' && c.url.includes('/rest/v1/streams?') && c.url.includes('channel_id=eq.'))).toHaveLength(0);
    const rpc = calls.filter((c) => isRpc(c, 'schedule_twitch_reconcile'));
    expect(rpc).toHaveLength(1);
    const body = rpc[0].body as { p_now: string; p_items: { channel_id: string; keep: string[]; covered_until: string | null }[] };
    expect(body.p_now).toBe(iso(NOW));
    const items = [...body.p_items].sort((a, b) => a.channel_id.localeCompare(b.channel_id));
    expect(items).toEqual([
      { channel_id: 'c-b1', keep: ['s1'], covered_until: null },
      { channel_id: 'c-b2', keep: [], covered_until: null },
      { channel_id: 'c-b4', keep: ['p1', 'p2', 'p3', 'p4'], covered_until: iso(NOW + 4 * HOUR) },
    ]);
    expect(stats.twitch_schedule_canceled).toBe(3);
    // 不再逐頻道 PATCH canceled（過期那一條 update 仍在，條件不含 id=in.）
    expect(calls.filter((c) => c.method === 'PATCH' && c.url.includes('id=in.('))).toHaveLength(0);
  });
});

describe('T7／T8 snapshot 指紋', () => {
  const since = iso(NOW - 12 * HOUR);
  const liveRow = {
    id: 's1', vtuber_id: 'v1', channel_id: 'c1', platform: 'youtube', external_id: 'LiveVideo01', source: 'yt_waiting_room',
    status: 'live', scheduled_start: iso(NOW - HOUR), scheduled_end: null, actual_start: iso(NOW - HOUR), actual_end: null,
    title: '新標題：雜談', category: null, thumbnail_url: null, is_schedule_frame: false, fetched_at: iso(NOW), merged_with: null,
  };
  const source = {
    active: [liveRow],
    ended: [],
    vtubers: [{ id: 'v1', name: '甲', img_url: null, nationality: 'TW', group_id: null, youtube_channel_id: 'UC0000000000000000000001', twitch_channel_id: null, slug: 'jia' }],
    groups: [],
    links: [],
  };
  const forbiddenGets = (calls: Call[]) =>
    calls.filter((c) => c.method === 'GET' && /\/rest\/v1\/(streams|vtubers|vtuber_groups|vtuber_group_links)\?/.test(c.url));

  it('T7 指紋不變不上傳：check 回 changed=false → 只有 1 個請求、回傳 0', async () => {
    const { db, calls } = fakeDb((url, method) => {
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_check')) return json({ changed: false, fingerprint: 'fp1' });
      if (method === 'GET') return json([]);
      return empty(200);
    });
    const bytes = await publishSnapshot(db, NOW, null);
    expect(calls).toHaveLength(1);
    expect(isRpc(calls[0], 'schedule_snapshot_check')).toBe(true);
    expect(calls[0].body).toEqual({ p_now: iso(NOW), p_since: since, p_force_minutes: 60 });
    expect(bytes).toBe(0);
  });

  it('T8 指紋變了才上傳：check → source → Storage 上傳（含新標題）→ mark；不 GET 舊表', async () => {
    const { db, calls } = fakeDb((url, method) => {
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_check')) return json({ changed: true, fingerprint: 'fp2' });
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_source')) return json(source);
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_mark')) return empty(204);
      if (method === 'POST' && url.includes('/storage/v1/object/')) return json({ Key: 'streams/v1/snapshot.json' });
      return json([]);
    });
    const bytes = await publishSnapshot(db, NOW, '2026-10-09T10:00:00Z');
    const kinds = calls.map((c) =>
      isRpc(c, 'schedule_snapshot_check') ? 'check'
        : isRpc(c, 'schedule_snapshot_source') ? 'source'
          : isRpc(c, 'schedule_snapshot_mark') ? 'mark'
            : c.method === 'POST' && c.url.includes('/storage/v1/object/streams/v1/snapshot.json') ? 'upload'
              : `${c.method} ${c.url}`,
    );
    expect(kinds).toEqual(['check', 'source', 'upload', 'mark']);
    expect(calls[1].body).toEqual({ p_since: since });
    expect(calls[3].body).toEqual({ p_fingerprint: 'fp2' });
    const uploaded = calls[2].body as { live: { external_id: string; title?: string }[]; channels: Record<string, unknown>; heavy_refreshed_at?: string };
    expect(uploaded.live).toEqual([expect.objectContaining({ external_id: 'LiveVideo01', title: '新標題：雜談' })]);
    expect(uploaded.channels.v1).toMatchObject({ name: '甲', slug: 'jia' });
    expect(uploaded.heavy_refreshed_at).toBe('2026-10-09T10:00:00Z');
    expect(forbiddenGets(calls)).toHaveLength(0);
    expect(bytes).toBeGreaterThan(0);
  });

  it('T8 上傳失敗時不呼叫 mark（下一輪指紋仍視為變動，會重傳）', async () => {
    const { db, calls } = fakeDb((url, method) => {
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_check')) return json({ changed: true, fingerprint: 'fp3' });
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_source')) return json(source);
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_mark')) return empty(204);
      if (method === 'POST' && url.includes('/storage/v1/object/')) return new Response('storage down', { status: 500 });
      return json([]);
    });
    await publishSnapshot(db, NOW, null).catch(() => undefined);
    expect(calls.some((c) => isRpc(c, 'schedule_snapshot_check'))).toBe(true);
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/storage/v1/object/streams/v1/snapshot.json'))).toBe(true);
    expect(calls.some((c) => isRpc(c, 'schedule_snapshot_mark'))).toBe(false);
  });
});

describe('T12 schedule-live 一輪不重複查現況', () => {
  const g = globalThis as unknown as { Deno?: unknown };
  const prevDeno = g.Deno;
  afterEach(() => {
    vi.unstubAllGlobals();
    g.Deno = prevDeno;
  });

  it('loadCurrentByChannel 的 streams 查詢（status=in.(scheduled,live) 且 channel_id=in.(）整輪只發 1 次', async () => {
    const UC = 'UC0000000000000000000001';
    const env: Record<string, string> = {
      SUPABASE_URL: 'http://db',
      SUPABASE_SERVICE_ROLE_KEY: 'svc',
      YOUTUBE_API_KEY: 'yk',
      TWITCH_CLIENT_ID: 'tid',
      TWITCH_CLIENT_SECRET: 'tsec',
    };
    let handler: ((req: Request) => Promise<Response>) | null = null;
    g.Deno = { serve: (h: (req: Request) => Promise<Response>) => { handler = h; }, env: { get: (k: string) => env[k] } };

    const nowIso = new Date().toISOString();
    const liveStream = {
      id: 's1', vtuber_id: 'v1', channel_id: 'c1', platform: 'youtube', external_id: 'LiveVideo01', source: 'yt_waiting_room',
      status: 'live', scheduled_start: null, scheduled_end: null, actual_start: nowIso, actual_end: null, title: 't', category: null,
      thumbnail_url: null, viewer_count: null, is_schedule_frame: false, fetched_at: '2026-01-01T00:00:00Z',
    };
    const rosterRpc = [{ id: 'c1', vtuber_id: 'v1', platform: 'youtube', external_id: UC, display_name: null, tier: 1, rss_fail_streak: 0, last_new_video_at: null, og_checked_at: null, og_miss_streak: 0 }];
    const calls: Call[] = [];
    vi.stubGlobal('fetch', (async (input: string | URL | Request, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      const method = init?.method ?? 'GET';
      if (url.includes('youtube.com/')) {
        // /live 頁：自己頻道、沒有直播（抓取成功 → 進入 checked）
        return new Response(`<html><head><meta property="og:image" content="https://yt3.ggpht.com/avatar"><meta property="og:title" content="x"></head><body>"channelId":"${UC}"</body></html>`, { status: 200 });
      }
      if (url.includes('i.ytimg.com')) return new Response(null, { status: 404 });
      calls.push({ url, method, body: null });
      if (method === 'POST' && url.includes('/rpc/schedule_roster')) return json(rosterRpc);
      if (method === 'POST' && url.includes('/rpc/schedule_snapshot_check')) return json({ changed: false, fingerprint: 'fp' });
      if (method === 'POST' && url.includes('/rpc/')) return json(null);
      if (method === 'GET' && url.includes('/rest/v1/vtuber_channels?')) {
        return json([{ id: 'c1', vtuber_id: 'v1', platform: 'youtube', external_id: UC, display_name: null, vtubers: { activity: 'active' } }]);
      }
      if (method === 'GET' && url.includes('/rest/v1/cron_shard_state?')) {
        return json([{ job_name: 'x', cursor_position: 0, shard_size: 100, total_items: 0, last_run_at: null, last_run_stats: null }]);
      }
      if (method === 'GET' && url.includes('/rest/v1/streams?')) {
        // near 查詢與現況查詢都回這一場直播中
        if (url.includes('platform=eq.youtube') && (url.includes('or=(status.eq.live') || url.includes('channel_id=in.('))) return json([liveStream]);
        return json([]);
      }
      if (method === 'GET') return json([]);
      return empty(200);
    }) as unknown as typeof fetch);

    await import('../../supabase/functions/schedule-live/index.ts');
    expect(handler).not.toBeNull();
    const res = await handler!(new Request('http://localhost/functions/v1/schedule-live', { method: 'POST', headers: { Authorization: 'Bearer svc' } }));
    const stats = (await res.json()) as { channels_processed: number; errors: string[] };
    // 前提：這輪真的查到一個頻道（否則現況查詢一次都不會發，測試沒有意義）
    expect(stats.channels_processed).toBe(1);
    const currentQueries = calls.filter(
      (c) => c.method === 'GET' && c.url.includes('/rest/v1/streams?') && c.url.includes('status=in.(scheduled,live)') && c.url.includes('channel_id=in.('),
    );
    expect(currentQueries).toHaveLength(1);
  });
});
