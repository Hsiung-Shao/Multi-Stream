import { describe, expect, it } from 'vitest';
import { computeMerges, mergeChanges, MERGE_WINDOW_MS, type MergeInput } from '../../supabase/functions/_shared/merge.ts';
import { TwitchClient, toScheduleSegment } from '../../supabase/functions/_shared/twitch.ts';
import { scheduleRowsFor } from '../../supabase/functions/_shared/sweep.ts';
import { buildSnapshot, type SnapshotSourceRow } from '../../supabase/functions/_shared/snapshot.ts';
import type { RosterChannel } from '../../supabase/functions/_shared/types.ts';

const T0 = Date.parse('2026-09-29T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function row(id: string, partial: Partial<MergeInput>): MergeInput {
  return {
    id,
    vtuber_id: 'v1',
    platform: 'youtube',
    source: 'yt_waiting_room',
    status: 'scheduled',
    scheduled_start: iso(T0),
    actual_start: null,
    is_schedule_frame: false,
    merged_with: null,
    ...partial,
  };
}

describe('雙平台合併', () => {
  it('YouTube 待機室與 Twitch 週表 ±30 分鐘內 → Twitch 併入 YouTube', () => {
    const m = computeMerges([
      row('yt', {}),
      row('tw', { platform: 'twitch', source: 'twitch_schedule', scheduled_start: iso(T0 + 20 * 60_000) }),
    ]);
    expect(m.get('yt')).toBeNull();
    expect(m.get('tw')).toBe('yt');
  });

  it('超過 30 分鐘、不同人、同平台同來源都不合併', () => {
    const m = computeMerges([
      row('yt', {}),
      row('far', { platform: 'twitch', source: 'twitch_schedule', scheduled_start: iso(T0 + MERGE_WINDOW_MS + 1) }),
      row('other', { vtuber_id: 'v2', platform: 'twitch', source: 'twitch_schedule' }),
      row('yt2', { scheduled_start: iso(T0 - 5 * 60_000) }), // 與 far 相差 35 分鐘以上
    ]);
    expect([...m.values()].every((v) => v === null)).toBe(true);
  });

  it('Twitch 週表遇到同一人的 Twitch 直播 → 預告併入直播；直播再併入同時的 YouTube', () => {
    const m = computeMerges([
      row('live', { platform: 'twitch', source: 'twitch_live', status: 'live', scheduled_start: null, actual_start: iso(T0 + 3 * 60_000) }),
      row('sched', { platform: 'twitch', source: 'twitch_schedule', scheduled_start: iso(T0) }),
    ]);
    expect(m.get('sched')).toBe('live');
    const withYt = computeMerges([
      row('yt', { status: 'live', actual_start: iso(T0) }),
      row('live', { platform: 'twitch', source: 'twitch_live', status: 'live', scheduled_start: null, actual_start: iso(T0 + 60_000) }),
    ]);
    expect(withYt.get('live')).toBe('yt');
  });

  it('直播中優先於排定中：Twitch 已開台、YouTube 待機室還沒開 → 待機室併入 Twitch 直播（直播不會被藏起來）', () => {
    const m = computeMerges([
      row('yt', { scheduled_start: iso(T0) }),
      row('live', { platform: 'twitch', source: 'twitch_live', status: 'live', scheduled_start: null, actual_start: iso(T0 + 5 * 60_000) }),
    ]);
    expect(m.get('live')).toBeNull();
    expect(m.get('yt')).toBe('live');
  });

  it('直播剛結束：預告仍併在已結束的直播底下（不會變回幽靈卡），已結束的列本身不寫入', () => {
    const m = computeMerges([
      row('ended', { platform: 'twitch', source: 'twitch_live', status: 'ended', scheduled_start: null, actual_start: iso(T0 + 5 * 60_000) }),
      row('sched', { platform: 'twitch', source: 'twitch_schedule', scheduled_start: iso(T0) }),
    ]);
    expect(m.get('sched')).toBe('ended');
    expect(m.has('ended')).toBe(false);
  });

  it('次要場次挑時間最近的主場次；常駐框、已結束不參與', () => {
    const m = computeMerges([
      row('yt-a', { scheduled_start: iso(T0) }),
      row('yt-b', { scheduled_start: iso(T0 + 50 * 60_000) }),
      row('tw', { platform: 'twitch', source: 'twitch_schedule', scheduled_start: iso(T0 + 40 * 60_000) }),
      row('frame', { is_schedule_frame: true }),
      row('ended', { status: 'ended' }),
    ]);
    expect(m.get('tw')).toBe('yt-b');
    expect(m.has('frame')).toBe(false);
    expect(m.has('ended')).toBe(false);
  });

  it('mergeChanges 只回傳和現況不同的列（含解除合併）', () => {
    const changes = mergeChanges([
      row('yt', {}),
      row('tw', { platform: 'twitch', source: 'twitch_schedule', merged_with: 'yt' }), // 已正確
      row('old', { platform: 'twitch', source: 'twitch_schedule', vtuber_id: 'v9', merged_with: 'gone' }), // 要解除
    ]);
    expect(changes).toEqual([{ id: 'old', merged_with: null }]);
  });
});

describe('Twitch 週表', () => {
  const ch: RosterChannel = { channelId: 'c1', vtuberId: 'v1', platform: 'twitch', externalId: '123', displayName: null, tier: null, rssFailStreak: 0 };

  it('toScheduleSegment：取欄位、缺 id／時間的丟掉', () => {
    expect(toScheduleSegment({ id: 's1', start_time: '2026-09-30T12:00:00Z', end_time: '2026-09-30T14:00:00Z', title: '雜談', category: { name: 'Just Chatting' }, canceled_until: null, is_recurring: true })).toEqual({
      id: 's1', startTime: '2026-09-30T12:00:00Z', endTime: '2026-09-30T14:00:00Z', title: '雜談', category: 'Just Chatting', canceledUntil: null, isRecurring: true,
    });
    expect(toScheduleSegment({ start_time: '2026-09-30T12:00:00Z' })).toBeNull();
    expect(toScheduleSegment({ id: 'x', start_time: 'nope' })).toBeNull();
  });

  it('scheduleRowsFor：取消與休假標 canceled，只收 7 天窗內', () => {
    const until = T0 + 7 * 86_400_000;
    const rows = scheduleRowsFor(
      ch,
      {
        segments: [
          { id: 'ok', startTime: iso(T0 + 3600_000), endTime: null, title: 't', category: null, canceledUntil: null, isRecurring: true },
          { id: 'cancel', startTime: iso(T0 + 7200_000), endTime: null, title: null, category: null, canceledUntil: iso(T0 + 9000_000), isRecurring: true },
          { id: 'vac', startTime: iso(T0 + 2 * 86_400_000), endTime: null, title: null, category: null, canceledUntil: null, isRecurring: true },
          { id: 'far', startTime: iso(T0 + 8 * 86_400_000), endTime: null, title: null, category: null, canceledUntil: null, isRecurring: true },
          { id: 'old', startTime: iso(T0 - 4 * 3600_000), endTime: null, title: null, category: null, canceledUntil: null, isRecurring: false },
        ],
        vacation: { start: iso(T0 + 86_400_000), end: iso(T0 + 3 * 86_400_000) },
      },
      T0,
      until,
    );
    expect(rows.map((r) => [r.external_id, r.status])).toEqual([
      ['ok', 'scheduled'],
      ['cancel', 'canceled'],
      ['vac', 'canceled'],
    ]);
    expect(rows[0]).toMatchObject({ source: 'twitch_schedule', platform: 'twitch', vtuber_id: 'v1', channel_id: 'c1', is_schedule_frame: false });
  });

  function client(pages: (Response | ((url: string) => Response))[]) {
    const urls: string[] = [];
    let i = 0;
    const fetchFn = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('oauth2/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 });
      urls.push(url);
      const p = pages[i++];
      return typeof p === 'function' ? p(url) : p;
    }) as unknown as typeof fetch;
    return { c: new TwitchClient({ clientId: 'id', clientSecret: 's', db: null, fetch: fetchFn }), urls };
  }

  it('fetchSchedule：404 ＝ 沒有週表（回 null，不丟錯）', async () => {
    const { c } = client([new Response('{"status":404}', { status: 404 })]);
    await expect(c.fetchSchedule('123', iso(T0), T0 + 7 * 86_400_000)).resolves.toBeNull();
    expect(c.calls.schedule).toBe(1);
  });

  it('fetchSchedule：翻頁到超過 until 為止，帶 cursor 與休假', async () => {
    const seg = (id: string, ms: number) => ({ id, start_time: iso(ms), end_time: null, title: id, category: null, canceled_until: null, is_recurring: true });
    const { c, urls } = client([
      new Response(JSON.stringify({ data: { segments: [seg('a', T0 + 3600_000)], vacation: { start_time: iso(T0), end_time: iso(T0 + 1) } }, pagination: { cursor: 'next1' } }), { status: 200 }),
      new Response(JSON.stringify({ data: { segments: [seg('b', T0 + 8 * 86_400_000)] }, pagination: { cursor: 'next2' } }), { status: 200 }),
      new Response('should not be fetched', { status: 500 }),
    ]);
    const s = await c.fetchSchedule('123', iso(T0), T0 + 7 * 86_400_000);
    expect(s?.segments.map((x) => x.id)).toEqual(['a', 'b']);
    expect(s?.vacation).toEqual({ start: iso(T0), end: iso(T0 + 1) });
    expect(urls).toHaveLength(2);
    expect(new URL(urls[1]).searchParams.get('after')).toBe('next1');
    expect(new URL(urls[0]).searchParams.get('first')).toBe('25');
  });

  it('fetchSchedule：其他錯誤照樣丟出', async () => {
    const { c } = client([new Response('boom', { status: 500 })]);
    await expect(c.fetchSchedule('123', iso(T0), T0 + 86_400_000)).rejects.toThrow(/HTTP 500/);
  });
});

describe('syncTwitchSchedule 遇到限速', () => {
  it('429 停止本輪；游標只前進到連續完成的位置，被限速的頻道不算失敗', async () => {
    const helixCalls: string[] = [];
    const twitchFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('oauth2/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 });
      helixCalls.push(url);
      const id = new URL(url).searchParams.get('broadcaster_id');
      if (id === 'b1') return new Response(JSON.stringify({ data: { segments: [] } }), { status: 200 });
      return new Response('slow down', { status: 429 });
    }) as unknown as typeof fetch;
    const dbFetch = (async (_input: string | URL | Request, init?: RequestInit) =>
      new Response(init?.method === 'PATCH' || init?.method === 'POST' ? '' : '[]', { status: 200, headers: { 'content-range': '0-0/0' } })) as unknown as typeof fetch;
    const { Db } = await import('../../supabase/functions/_shared/db.ts');
    const { syncTwitchSchedule } = await import('../../supabase/functions/_shared/sweep.ts');
    const { emptyStats } = await import('../../supabase/functions/_shared/types.ts');
    const db = new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: dbFetch });
    const twitch = new TwitchClient({ clientId: 'id', clientSecret: 's', db: null, fetch: twitchFetch });
    const mk = (id: string): RosterChannel => ({ channelId: `c-${id}`, vtuberId: `v-${id}`, platform: 'twitch', externalId: id, displayName: null, tier: null, rssFailStreak: 0 });
    const stats = emptyStats('heavy', T0);
    const res = await syncTwitchSchedule(db, twitch, [mk('b1'), mk('b2'), mk('b3')], {
      concurrency: 1,
      deadline: { at: Date.now() + 60_000 },
      stats,
      now: T0,
    });
    expect(res).toEqual({ processed: 1, advance: 1 });
    expect(stats.twitch_schedule_rate_limited).toBe(1);
    expect(stats.twitch_schedule_failed).toBe(0);
    expect(helixCalls).toHaveLength(2); // b3 沒有開始
  });
});

describe('Twitch 週表的補強（code review 修正）', () => {
  // 假 DB：記下每個請求，select 依網址回資料
  function fakeDb(selectRows: (url: string) => unknown[]) {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'GET') {
        const data = selectRows(url);
        return new Response(JSON.stringify(data), { status: 200, headers: { 'content-range': `0-${Math.max(data.length - 1, 0)}/${data.length}` } });
      }
      return new Response('', { status: 200, headers: { 'content-range': '0-0/1' } });
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
  }

  it('fetchSchedule 翻到頁數上限還沒走完 → coveredUntil＝最後一段；走完就沒有這個欄位', async () => {
    const seg = (id: string, ms: number) => ({ id, start_time: iso(ms), end_time: null, title: id, category: null, canceled_until: null, is_recurring: true });
    const page = (id: string, ms: number, cursor: string | null) =>
      new Response(JSON.stringify({ data: { segments: [seg(id, ms)] }, pagination: cursor ? { cursor } : {} }), { status: 200 });
    const fetchFn = (responses: Response[]) => {
      let i = 0;
      return (async (input: string | URL | Request) =>
        String(input).includes('oauth2/token') ? new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 }) : responses[i++]) as unknown as typeof fetch;
    };
    const truncated = new TwitchClient({ clientId: 'id', clientSecret: 's', db: null, fetch: fetchFn([page('a', T0 + 3600_000, 'n1'), page('b', T0 + 7200_000, 'n2')]) });
    const s1 = await truncated.fetchSchedule('1', iso(T0), T0 + 7 * 86_400_000, 2);
    expect(s1?.coveredUntil).toBe(iso(T0 + 7200_000));
    const full = new TwitchClient({ clientId: 'id', clientSecret: 's', db: null, fetch: fetchFn([page('a', T0 + 3600_000, null)]) });
    expect((await full.fetchSchedule('1', iso(T0), T0 + 7 * 86_400_000, 2))?.coveredUntil).toBeUndefined();
  });

  it('cancelOrphanTwitchSchedule：不在名冊的頻道的未來預告標 canceled', async () => {
    const { Db } = await import('../../supabase/functions/_shared/db.ts');
    const { cancelOrphanTwitchSchedule } = await import('../../supabase/functions/_shared/sweep.ts');
    const { emptyStats } = await import('../../supabase/functions/_shared/types.ts');
    const { fetchFn, calls } = fakeDb(() => [{ id: 'r1', channel_id: 'keep' }, { id: 'r2', channel_id: 'gone' }]);
    const db = new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn });
    const stats = emptyStats('heavy', T0);
    await cancelOrphanTwitchSchedule(db, new Set(['keep']), stats, T0);
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toContain('id=in.("r2")');
    expect(patch?.body).toMatchObject({ status: 'canceled' });
    expect(stats.twitch_schedule_canceled).toBe(1);
  });

  it('softStep：失敗只記錯誤、不往外丟', async () => {
    const { softStep } = await import('../../supabase/functions/_shared/sweep.ts');
    const { emptyStats } = await import('../../supabase/functions/_shared/types.ts');
    const stats = emptyStats('heavy', T0);
    await expect(softStep(stats, 'merge', async () => { throw new Error('db down'); })).resolves.toBeUndefined();
    expect(stats.errors).toEqual(['merge: db down']);
  });
});

describe('snapshot 合併與 slug', () => {
  function srow(partial: Partial<SnapshotSourceRow>): SnapshotSourceRow {
    return {
      id: 'x', vtuber_id: 'v1', channel_id: 'c', platform: 'youtube', external_id: 'YtVideo0001', source: 'yt_waiting_room',
      status: 'scheduled', scheduled_start: iso(T0 + 3600_000), scheduled_end: null, actual_start: null, actual_end: null,
      title: null, category: null, thumbnail_url: null, viewer_count: null, is_schedule_frame: false, fetched_at: iso(T0), merged_with: null,
      ...partial,
    };
  }
  const vt = [{ id: 'v1', name: '一', img_url: null, nationality: 'TW', group_id: null, youtube_channel_id: 'UC1', twitch_channel_id: 'one', slug: 'one' }];

  it('被併入的場次不單獨輸出，改成主場次的 also；channels 帶 slug', () => {
    const snap = buildSnapshot(
      [
        srow({ id: 'yt' }),
        srow({ id: 'tw', platform: 'twitch', external_id: 'seg1', source: 'twitch_schedule', merged_with: 'yt' }),
      ],
      vt,
      new Map(),
      T0,
      null,
    );
    expect(snap.upcoming).toHaveLength(1);
    expect(snap.upcoming[0].also).toEqual([{ platform: 'twitch', external_id: 'seg1', source: 'twitch_schedule' }]);
    expect(snap.channels.v1.slug).toBe('one');
  });

  it('主場次不在輸出裡（例如被隱藏）時，次要場次照常輸出', () => {
    const snap = buildSnapshot(
      [srow({ id: 'yt', status: 'hidden' }), srow({ id: 'tw', platform: 'twitch', external_id: 'seg1', source: 'twitch_schedule', merged_with: 'yt' })],
      vt,
      new Map(),
      T0,
      null,
    );
    expect(snap.upcoming.map((s) => s.external_id)).toEqual(['seg1']);
    expect('also' in snap.upcoming[0]).toBe(false);
  });
});
