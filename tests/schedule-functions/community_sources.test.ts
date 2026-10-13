// 社群週表（community_post）與使用者投稿（user_submission）：沒有影片 ID 的來源在排程裡的行為。
//   - 合併：任何真實場次（待機室／直播／Twitch）出現在 30 分鐘內就把它併掉；兩個沒有影片 ID 的場次互不合併
//   - 重查／共享表：loadPendingYouTube 只查待機室；loadCurrentByChannel 排除這兩種來源（external_id 不是 videoId）
// T 編號對應計畫〈社群週表讀圖排程調整〉的測試規格表
import { describe, expect, it } from 'vitest';
import { canMerge, computeMerges, type MergeInput } from '../../supabase/functions/_shared/merge.ts';
import { applyMerges, expireOverdue, loadCurrentByChannel, loadPendingYouTube } from '../../supabase/functions/_shared/sweep.ts';
import { Db } from '../../supabase/functions/_shared/db.ts';
import { emptyStats } from '../../supabase/functions/_shared/types.ts';

const T0 = Date.parse('2026-10-06T12:00:00Z');
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

describe('社群週表場次的合併', () => {
  it('同平台的待機室出現在 30 分鐘內 → 社群場次併入待機室（不反向）', () => {
    const waiting = row('w', {});
    const post = row('p', { source: 'community_post', scheduled_start: iso(T0 + 10 * 60_000) });
    expect(canMerge(waiting, post)).toBe(true);
    expect(canMerge(post, waiting)).toBe(false);
    const m = computeMerges([post, waiting]);
    expect(m.get('p')).toBe('w');
    expect(m.get('w')).toBeNull();
  });

  it('Twitch 直播中也能把社群場次併掉；直播中永遠是主場次', () => {
    const live = row('l', { platform: 'twitch', source: 'twitch_live', status: 'live', actual_start: iso(T0), scheduled_start: null });
    const post = row('p', { source: 'community_post' });
    const m = computeMerges([post, live]);
    expect(m.get('p')).toBe('l');
  });

  it('使用者投稿與社群週表彼此不合併；兩個社群場次也不合併', () => {
    const a = row('a', { source: 'community_post' });
    const b = row('b', { source: 'user_submission', scheduled_start: iso(T0 + 5 * 60_000) });
    const c = row('c', { source: 'community_post', scheduled_start: iso(T0 + 5 * 60_000), vtuber_id: 'v1' });
    expect(canMerge(a, b)).toBe(false);
    expect(canMerge(b, a)).toBe(false);
    expect(canMerge(a, c)).toBe(false);
    const m = computeMerges([a, b, c]);
    expect(m.get('a')).toBeNull();
    expect(m.get('b')).toBeNull();
    expect(m.get('c')).toBeNull();
  });

  it('超過 30 分鐘就不併（當成不同場）', () => {
    const waiting = row('w', {});
    const post = row('p', { source: 'community_post', scheduled_start: iso(T0 + 45 * 60_000) });
    expect(computeMerges([post, waiting]).get('p')).toBeNull();
  });
});

describe('時間未定社群場次的合併（time_tbd，2026-10-14）', () => {
  /** 台北 10/14 00:00（時間未定場次存當天 00:00）、10/15 00:00 */
  const TBD_1014 = '2026-10-13T16:00:00.000Z';
  const TBD_1015 = '2026-10-14T16:00:00.000Z';

  it('T10 時間未定社群場次併入同人同台北日期的待機室', () => {
    // 不受 30 分鐘限制
    const post = row('p', { source: 'community_post', scheduled_start: TBD_1014, time_tbd: true });
    const waiting = row('w', { scheduled_start: '2026-10-14T13:00:00.000Z' }); // 台北 10/14 21:00
    const m = computeMerges([post, waiting]);
    expect(m.get('p')).toBe('w');
    expect(m.get('w')).toBeNull();
  });

  it('T10 投稿來源的時間未定場次同樣併入同日待機室', () => {
    const sub = row('s', { source: 'user_submission', scheduled_start: TBD_1014, time_tbd: true });
    const waiting = row('w', { scheduled_start: '2026-10-14T13:00:00.000Z' });
    expect(computeMerges([sub, waiting]).get('s')).toBe('w');
  });

  it('T10 不是時間未定的 00:00 場次仍受 30 分鐘限制', () => {
    const waiting = row('w', { scheduled_start: '2026-10-14T13:00:00.000Z' });
    const midnight = row('m', { source: 'community_post', scheduled_start: TBD_1014, time_tbd: false });
    expect(computeMerges([midnight, waiting]).get('m')).toBeNull();
  });

  it('T10 不同人的時間未定場次不併', () => {
    const waiting = row('w', { scheduled_start: '2026-10-14T13:00:00.000Z' });
    const other = row('o', { source: 'community_post', scheduled_start: TBD_1014, time_tbd: true, vtuber_id: 'v2' });
    expect(computeMerges([other, waiting]).get('o')).toBeNull();
  });

  it('T11 時間未定場次不併入隔天的場次', () => {
    const post = row('p', { source: 'community_post', scheduled_start: TBD_1014, time_tbd: true });
    const nextDay = row('w', { scheduled_start: '2026-10-14T16:10:00.000Z' }); // 台北 10/15 00:10
    expect(computeMerges([post, nextDay]).get('p')).toBeNull();
  });

  it('T11 前一天深夜的待機室不併入隔天的時間未定場次', () => {
    // 離 00:00 只差 10 分鐘，但台北日期不同
    const post = row('p', { source: 'community_post', scheduled_start: TBD_1015, time_tbd: true }); // 10/15 時間未定
    const lateNight = row('w', { scheduled_start: '2026-10-14T15:50:00.000Z' }); // 台北 10/14 23:50
    expect(computeMerges([post, lateNight]).get('p')).toBeNull();
  });
});

function fakeDb() {
  const urls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response('[]', { status: 200, headers: { 'Content-Range': '*/0' } });
  }) as unknown as typeof fetch;
  return { db: new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn }), urls };
}

describe('沒有影片 ID 的來源不進重查與共享表', () => {
  it('loadPendingYouTube 三種範圍都只查 yt_waiting_room', async () => {
    const { db, urls } = fakeDb();
    await loadPendingYouTube(db, T0, 'all');
    await loadPendingYouTube(db, T0, 'near');
    await loadPendingYouTube(db, T0, 'frames');
    expect(urls).toHaveLength(3);
    for (const u of urls) expect(u).toContain('source=eq.yt_waiting_room');
  });

  it('loadCurrentByChannel 排除 community_post／user_submission', async () => {
    const { db, urls } = fakeDb();
    await loadCurrentByChannel(db, ['c1']);
    expect(urls[0]).toContain('source=not.in.(community_post,user_submission)');
  });

  it('expireOverdue 也讓 Twitch 平台的社群週表／投稿場次過期（它們沒有別的過期路徑）', async () => {
    const { db, urls } = fakeDb();
    await expireOverdue(db, emptyStats('light', T0), T0);
    const expire = urls.find((u) => u.includes('status=eq.scheduled&actual_start=is.null') && !decodeURIComponent(u).includes('time_tbd=eq.true'));
    expect(expire).toBeDefined();
    expect(expire).toContain('or=(platform.eq.youtube,source.in.(community_post,user_submission))');
  });
});

describe('時間未定場次併入的主場次結束後', () => {
  const TBD_1014 = '2026-10-13T16:00:00.000Z'; // 台北 10/14 00:00
  const NOW = Date.parse('2026-10-14T15:00:00.000Z'); // 台北 10/14 23:00
  const tbd = row('t', { source: 'community_post', scheduled_start: TBD_1014, time_tbd: true });

  interface Call { url: string; method: string; body: unknown }
  /** active＝status in (scheduled,live) 的回應；ended＝最近結束的回應 */
  function mergeDb(active: unknown[], ended: unknown[]) {
    const calls: Call[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === 'POST' && url.includes('/rpc/schedule_merge_check')) return new Response(JSON.stringify({ changed: true, fingerprint: 'fp' }), { status: 200 });
      if (method === 'GET' && url.includes('status=in.(scheduled,live)')) return new Response(JSON.stringify(active), { status: 200 });
      if (method === 'GET' && url.includes('status=eq.ended')) return new Response(JSON.stringify(ended), { status: 200 });
      return new Response('', { status: 200, headers: { 'content-range': '0-0/1' } });
    }) as unknown as typeof fetch;
    return { db: new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn }), calls };
  }
  const patches = (calls: Call[]) => calls.filter((c) => c.method === 'PATCH' && c.url.includes('/rest/v1/streams?'));

  it('主場次已結束 → 時間未定場次改為 expired', async () => {
    // 已併在直播底下，直播結束：下一輪讀到 ended 主場次就把 tbd 過期，避免主場次移出 3 小時視窗後 tbd 重新冒出來
    const ended = row('l', { platform: 'twitch', source: 'twitch_live', status: 'ended', actual_start: '2026-10-14T12:00:00.000Z', scheduled_start: null });
    const { db, calls } = mergeDb([{ ...tbd, merged_with: 'l' }], [ended]);
    const stats = emptyStats('live', NOW);
    await applyMerges(db, stats, NOW);
    const expire = patches(calls).find((c) => (c.body as Record<string, unknown>).status === 'expired');
    expect(expire, '沒有把 tbd 改成 expired 的 PATCH').toBeDefined();
    expect(expire?.url).toContain('id=in.("t")');
    expect(stats.streams_expired).toBe(1);
  });

  it('主場次還是 scheduled／live → 只設 merged_with、不過期', async () => {
    const live = row('l', { platform: 'twitch', source: 'twitch_live', status: 'live', actual_start: '2026-10-14T12:00:00.000Z', scheduled_start: null });
    const waiting = row('w', { scheduled_start: '2026-10-14T13:00:00.000Z', vtuber_id: 'v2' });
    const tbd2 = row('t2', { source: 'community_post', scheduled_start: TBD_1014, time_tbd: true, vtuber_id: 'v2' });
    const { db, calls } = mergeDb([tbd, live, waiting, tbd2], []);
    const stats = emptyStats('live', NOW);
    await applyMerges(db, stats, NOW);
    const ps = patches(calls);
    expect(ps.some((c) => (c.body as Record<string, unknown>).status === 'expired')).toBe(false);
    expect(ps.map((c) => c.body)).toEqual(expect.arrayContaining([{ merged_with: 'l' }, { merged_with: 'w' }]));
    expect(stats.streams_expired).toBe(0);
  });

  it('非時間未定的社群場次併入已結束的主場次 → 不過期', async () => {
    // 有寫時間的列照原本的 3 小時規則過期，不在合併時處理
    const post = row('p', { source: 'community_post', scheduled_start: '2026-10-14T12:10:00.000Z' });
    const ended = row('l', { platform: 'twitch', source: 'twitch_live', status: 'ended', actual_start: '2026-10-14T12:00:00.000Z', scheduled_start: null });
    const { db, calls } = mergeDb([post], [ended]);
    const stats = emptyStats('live', NOW);
    await applyMerges(db, stats, NOW);
    expect(patches(calls).some((c) => (c.body as Record<string, unknown>).status === 'expired')).toBe(false);
    expect(stats.streams_expired).toBe(0);
  });
});
