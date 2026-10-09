import { describe, expect, it } from 'vitest';
import { expireOverdue, loadPendingYouTube, rssSweep, writeChannelStates } from '../../supabase/functions/_shared/sweep.ts';
import { Db } from '../../supabase/functions/_shared/db.ts';
import { emptyStats, type RosterChannel } from '../../supabase/functions/_shared/types.ts';

const NOW = Date.parse('2026-09-28T12:00:00Z');

function channel(i: number, streak = 0): RosterChannel {
  return {
    channelId: `c${i}`,
    vtuberId: `v${i}`,
    platform: 'youtube',
    externalId: `UC${String(i).padStart(22, '0')}`,
    displayName: null,
    tier: 1,
    rssFailStreak: streak,
  };
}

/** 記錄每次 PostgREST 請求（url、method、body）的假 Db */
function fakeDb(respond: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { db: new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn }), calls };
}

describe('writeChannelStates：一次 RPC、payload 原樣送出', () => {
  // 2026-10-09 出口流量瘦身：「payload 有的 key 才更新、tier 保留、新頻道 tier 2／first_seen」改由資料庫端
  // schedule_upsert_channel_states 處理（行為鎖在 supabase/tests/schedule_rpc_egress.sql T5）。這裡只鎖 TS 端：
  // 不先 GET tier、每列的 key 原樣送出（失敗列沒有 rss_last_ok_at，不能被補成 null）。
  it('失敗列不帶 rss_last_ok_at，不會被補 null；不 GET schedule_channel_state、不直接 upsert 表', async () => {
    const { db, calls } = fakeDb(() => new Response('', { status: 200 }));
    const rows = [
      { channel_id: 'c1', rss_fail_streak: 0, rss_last_ok_at: 'T', rss_last_error: null, last_checked_at: 'T' },
      { channel_id: 'c2', rss_fail_streak: 2, rss_last_error: 'timeout', last_checked_at: 'T' },
      { channel_id: 'c3', rss_fail_streak: 0, rss_last_ok_at: 'T', rss_last_error: null, last_checked_at: 'T' },
    ];
    await writeChannelStates(db, rows);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/rest/v1/rpc/schedule_upsert_channel_states');
    const sent = (calls[0].body as { p_rows: Record<string, unknown>[] }).p_rows;
    expect(sent).toEqual(rows);
    expect('rss_last_ok_at' in sent.find((r) => r.channel_id === 'c2')!).toBe(false);
  });
});

describe('rssSweep：限流、死頻道、沒有 API 備援', () => {

  it('429 的頻道不算已處理、不加 fail streak，且本輪停止開始新頻道（判定整批限流）', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n += 1;
      return new Response('slow down', { status: 429 });
    }) as unknown as typeof fetch;
    const stats = emptyStats('light', NOW);
    const r = await rssSweep([channel(1, 2), channel(2), channel(3)], { concurrency: 1, deadline: { at: Date.now() + 60_000 }, fetch: fetchFn, stats, now: NOW, jitterMs: 0 });
    expect(n).toBe(1);
    expect(r.processed).toHaveLength(0);
    expect(stats.rss_rate_limited).toBe(1);
    expect(stats.rss_throttled).toBe(true);
    expect(r.stateUpdates).toEqual([{ channel_id: 'c1', rss_fail_streak: 2, rss_last_error: 'throttled: http 429', last_checked_at: new Date(NOW).toISOString() }]);
  });

  it('連續失敗達 10 次的死頻道跳過不打 RSS，但算已處理讓游標前進', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n += 1;
      return new Response('<feed></feed>', { status: 200 });
    }) as unknown as typeof fetch;
    const stats = emptyStats('light', NOW);
    const r = await rssSweep([channel(1, 10), channel(2)], { concurrency: 2, deadline: { at: Date.now() + 60_000 }, fetch: fetchFn, stats, now: NOW, jitterMs: 0 });
    expect(n).toBe(1);
    expect(r.processed.map((c) => c.channelId).sort()).toEqual(['c1', 'c2']);
    expect(stats.rss_skipped_dead).toBe(1);
    expect(stats.rss_ok).toBe(1);
  });

  it('假 404 大量出現：失敗率過半判定整批限流，停止開新請求，失敗不算在頻道頭上、也不打 API', async () => {
    let n = 0;
    const urls: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      n += 1;
      urls.push(String(input));
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    const stats = emptyStats('light', NOW);
    const chans = Array.from({ length: 60 }, (_, i) => channel(i + 1, 1));
    const r = await rssSweep(chans, { concurrency: 1, deadline: { at: Date.now() + 60_000 }, fetch: fetchFn, stats, now: NOW, jitterMs: 0 });
    expect(n).toBe(20); // 第 20 次時判定限流，之後不再開始
    expect(urls.every((u) => u.includes('feeds/videos.xml'))).toBe(true); // 沒有 API 備援
    expect(stats.rss_throttled).toBe(true);
    expect(r.processed).toHaveLength(0);
    expect(r.stateUpdates.every((u) => u.rss_fail_streak === 1)).toBe(true);
  });

  it('非限流輪次的零星失敗才累加 fail streak', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n += 1;
      return n === 3 ? new Response('', { status: 404 }) : new Response('<feed></feed>', { status: 200 });
    }) as unknown as typeof fetch;
    const stats = emptyStats('light', NOW);
    const chans = Array.from({ length: 30 }, (_, i) => channel(i + 1, 0));
    const r = await rssSweep(chans, { concurrency: 1, deadline: { at: Date.now() + 60_000 }, fetch: fetchFn, stats, now: NOW, jitterMs: 0 });
    expect(stats.rss_throttled).toBe(false);
    expect(r.processed).toHaveLength(30);
    expect(r.advance).toBe(30);
    expect(r.stateUpdates.filter((u) => u.rss_fail_streak === 1)).toHaveLength(1);
  });

  it('限流時游標只前進到第一個失敗的頻道之前（不跳過失敗的、也不重抓已成功的前綴）', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n += 1;
      return n <= 5 ? new Response('<feed></feed>', { status: 200 }) : new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    const stats = emptyStats('light', NOW);
    const deadline = { at: Date.now() + 60_000 };
    const chans = Array.from({ length: 60 }, (_, i) => channel(i + 1, 0));
    const r = await rssSweep(chans, { concurrency: 1, deadline, fetch: fetchFn, stats, now: NOW, jitterMs: 0 });
    expect(stats.rss_throttled).toBe(true);
    expect(r.advance).toBe(5);
    // 不改呼叫端的時間預算（budget_exhausted 才不會被誤判）
    expect(deadline.at).toBeGreaterThan(Date.now());
  });
});

describe('expireOverdue：資料庫端統一過期', () => {
  it('排定時間過後 3 小時仍未開始的 YouTube 待機室 → expired（常駐框與已開始的不動）', async () => {
    const { db, calls } = fakeDb(() => new Response(null, { status: 204, headers: { 'content-range': '*/7' } }));
    const stats = emptyStats('light', NOW);
    expect(await expireOverdue(db, stats, NOW)).toBe(7);
    expect(stats.streams_expired).toBe(7);
    // 先把排定時間進到 14 天內的常駐框轉成一般待機室（旗標是寫入當下算的），再過期
    expect(calls).toHaveLength(2);
    expect(decodeURIComponent(calls[0].url)).toContain('platform=eq.youtube&status=eq.scheduled&is_schedule_frame=eq.true&scheduled_start=lte.2026-10-12T12:00:00.000Z');
    expect(calls[0].body).toEqual({ is_schedule_frame: false });
    expect(stats.frames_unflagged).toBe(7);
    const u = decodeURIComponent(calls[1].url);
    expect(calls[1].method).toBe('PATCH');
    // YouTube 待機室＋任何平台的社群週表／投稿場次（2026-10-05）
    expect(u).toContain('or=(platform.eq.youtube,source.in.(community_post,user_submission))&status=eq.scheduled&actual_start=is.null&is_schedule_frame=eq.false&scheduled_start=lt.2026-09-28T09:00:00.000Z');
    expect(calls[1].body).toMatchObject({ status: 'expired' });
  });
});

describe('loadPendingYouTube：三種範圍的查詢條件', () => {
  it('frames 含常駐框與沒有排定時間的待機室；all 排除兩者；near 只看直播中與 2 小時內（過期 3 小時以上的不看）；all／frames 最久沒查的先查', async () => {
    const { db, calls } = fakeDb(() => new Response('[]', { status: 200 }));
    await loadPendingYouTube(db, NOW, 'frames');
    await loadPendingYouTube(db, NOW, 'all');
    await loadPendingYouTube(db, NOW, 'near');
    const [frames, all, near] = calls.map((c) => decodeURIComponent(c.url));
    expect(frames).toContain('status=eq.scheduled&or=(is_schedule_frame.eq.true,scheduled_start.is.null)');
    expect(all).toContain('is_schedule_frame=eq.false&or=(status.eq.live,and(status.eq.scheduled,scheduled_start.not.is.null))');
    expect(near).toContain('is_schedule_frame=eq.false&or=(status.eq.live,and(status.eq.scheduled,scheduled_start.lte.2026-09-28T14:00:00.000Z,scheduled_start.gte.2026-09-28T09:00:00.000Z))');
    expect(frames).toContain('order=fetched_at,id');
    expect(all).toContain('order=fetched_at,id');
    for (const u of [frames, all, near]) expect(u).toContain('fetched_at=lt.2026-09-28T12:00:00.000Z');
  });
});

describe('每日配額：原子累加', () => {
  async function run(units: number, exceeded: boolean, rpcTotal: unknown = 42) {
    const { Db } = await import('../../supabase/functions/_shared/db.ts');
    const { addDailyQuota } = await import('../../supabase/functions/_shared/run.ts');
    const calls: { url: string; body: unknown }[] = [];
    const db = new Db({
      url: 'http://db', serviceRoleKey: 'k',
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
        if (String(input).includes('/rpc/')) return new Response(JSON.stringify(rpcTotal), { status: 200 });
        return new Response(JSON.stringify([{ cursor_position: 9, last_run_stats: { day: '2026-09-30' } }]), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const total = await addDailyQuota(db, Date.parse('2026-09-30T12:00:00Z'), units, exceeded);
    return { total, calls };
  }

  it('有用量：呼叫 schedule_add_quota（太平洋時間日期）並回傳累計', async () => {
    const { total, calls } = await run(3, false);
    expect(total).toBe(42);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/rest/v1/rpc/schedule_add_quota');
    expect(calls[0].body).toEqual({ p_day: '2026-09-30', p_units: 3 });
  });

  it('沒有用量：不寫，只讀今天的累計；quotaExceeded：直接記到每日上限', async () => {
    const idle = await run(0, false);
    expect(idle.total).toBe(9);
    expect(idle.calls.some((c) => c.url.includes('/rpc/'))).toBe(false);
    const ex = await run(1, true);
    expect((ex.calls[0].body as { p_units: number }).p_units).toBe(2000);
  });
});
