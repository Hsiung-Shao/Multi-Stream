// 社群週表（community_post）與使用者投稿（user_submission）：沒有影片 ID 的來源在排程裡的行為。
//   - 合併：任何真實場次（待機室／直播／Twitch）出現在 30 分鐘內就把它併掉；兩個沒有影片 ID 的場次互不合併
//   - 重查／共享表：loadPendingYouTube 只查待機室；loadCurrentByChannel 排除這兩種來源（external_id 不是 videoId）
// T 編號對應計畫〈社群週表讀圖排程調整〉的測試規格表
import { describe, expect, it } from 'vitest';
import { canMerge, computeMerges, mergePlan, type MergeInput } from '../../supabase/functions/_shared/merge.ts';
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

describe('時間未定場次只由寫入之後才開始的場次兌現（2026-10-14）', () => {
  const TBD_1014 = '2026-10-13T16:00:00.000Z'; // 台北 10/14 00:00
  const tbd = (created_at?: string) => row('t', { source: 'community_post', external_id: 'post:P:1', scheduled_start: TBD_1014, time_tbd: true, ...(created_at ? { created_at } : {}) });
  const endedAt = (actual_start: string) => row('w', { status: 'ended', external_id: 'Wait0000001', actual_start });

  it('T21 寫入前就已開始並結束的場次不讓時間未定列合併或過期', () => {
    // created_at 台北 13:00；待機室 10:00 開播、已結束
    const rows = [tbd('2026-10-14T05:00:00.000Z'), endedAt('2026-10-14T02:00:00.000Z')];
    expect(computeMerges(rows).get('t')).toBeNull();
    expect(mergePlan(rows).expire).not.toContain('t');
  });

  it('T21 排定時間早於寫入時間的待機室也不能讓時間未定列合併', () => {
    // 待機室排在台北 11:00（scheduled、還沒開），created_at 13:00
    const waiting = row('w', { external_id: 'Wait0000001', scheduled_start: '2026-10-14T03:00:00.000Z' });
    expect(computeMerges([tbd('2026-10-14T05:00:00.000Z'), waiting]).get('t')).toBeNull();
  });

  it('T25 announced_at 為 null 時退回 created_at 判斷兌現', () => {
    // announced_at null、created_at 台北 13:00；待機室 10:00 開播、已結束
    const rows = [{ ...tbd('2026-10-14T05:00:00.000Z'), announced_at: null }, endedAt('2026-10-14T02:00:00.000Z')];
    expect(computeMerges(rows).get('t')).toBeNull();
    expect(mergePlan(rows).expire).not.toContain('t');
  });

  it('T21 沒有 created_at 的時間未定列維持原本的合併與過期', () => {
    const rows = [tbd(), endedAt('2026-10-14T02:00:00.000Z')];
    expect(computeMerges(rows).get('t')).toBe('w');
    expect(mergePlan(rows).expire).toContain('t');
  });

  it('T22 寫入之後才開播並結束的場次讓時間未定列過期', () => {
    // created_at 台北 09:00；20:00 開播、已結束
    const rows = [tbd('2026-10-14T01:00:00.000Z'), endedAt('2026-10-14T12:00:00.000Z')];
    expect(mergePlan(rows).expire).toContain('t');
  });

  it('T22 寫入之後才開播的直播中場次讓時間未定列合併、不過期', () => {
    const live = row('l', { status: 'live', external_id: 'Live0000001', actual_start: '2026-10-14T12:00:00.000Z' });
    const rows = [tbd('2026-10-14T01:00:00.000Z'), live];
    expect(computeMerges(rows).get('t')).toBe('l');
    expect(mergePlan(rows).expire).not.toContain('t');
  });

  it('T22 開始時間剛好等於寫入時間也算兌現', () => {
    const live = row('l', { status: 'live', external_id: 'Live0000001', actual_start: '2026-10-14T05:00:00.000Z' });
    expect(computeMerges([tbd('2026-10-14T05:00:00.000Z'), live]).get('t')).toBe('l');
  });
});

describe('時間未定列以發文時間 announced_at 判斷兌現（2026-10-14）', () => {
  const TBD_1014 = '2026-10-13T16:00:00.000Z'; // 台北 10/14 00:00
  /** 發文 10/14 08:00、寫入 10/14 22:00（讀圖排程晚了才寫入） */
  const tbd = (announced_at = '2026-10-14T00:00:00.000Z') =>
    row('t', { source: 'community_post', external_id: 'post:P:1', scheduled_start: TBD_1014, time_tbd: true, announced_at, created_at: '2026-10-14T14:00:00.000Z' });

  it('T24 發文後開播、寫入前已結束的場次讓時間未定列過期', () => {
    const ended = row('w', { status: 'ended', external_id: 'Wait0000001', actual_start: '2026-10-14T12:00:00.000Z' }); // 20:00
    expect(mergePlan([tbd(), ended]).expire).toContain('t');
  });

  it('T24 發文後開播、寫入時仍在直播的場次讓時間未定列合併', () => {
    const live = row('l', { status: 'live', external_id: 'Live0000001', actual_start: '2026-10-14T12:00:00.000Z' });
    const rows = [tbd(), live];
    expect(computeMerges(rows).get('t')).toBe('l');
    expect(mergePlan(rows).expire).not.toContain('t');
  });

  it('T25 發文前就已開始的場次不讓時間未定列兌現', () => {
    // 主場次 07:00 開播、已結束；發文 08:00
    const ended = row('w', { status: 'ended', external_id: 'Wait0000001', actual_start: '2026-10-13T23:00:00.000Z' });
    const rows = [tbd(), ended];
    expect(computeMerges(rows).get('t')).toBeNull();
    expect(mergePlan(rows).expire).not.toContain('t');
  });
});

describe('同一來源同一天已有具體時間時，時間未定列不合併（2026-10-14）', () => {
  const TBD_1014 = '2026-10-13T16:00:00.000Z'; // 台北 10/14 00:00
  const AT_2100 = '2026-10-14T13:00:00.000Z'; // 台北 10/14 21:00
  const timedPost = (id: string, external_id: string, extra: Partial<MergeInput> = {}) => row(id, { source: 'community_post', external_id, scheduled_start: AT_2100, ...extra });
  const tbdPost = row('P2', { source: 'community_post', external_id: 'post:P:2', scheduled_start: TBD_1014, time_tbd: true });
  const waiting = row('w', { external_id: 'Wait0000001', scheduled_start: AT_2100 });

  it('T23 同篇貼文同日有 21:00 列時，該列併入待機室、時間未定列不併', () => {
    const m = computeMerges([timedPost('P1', 'post:P:1'), tbdPost, waiting]);
    expect(m.get('P1')).toBe('w');
    expect(m.get('P2')).toBeNull();
  });

  it('T23 待機室已結束時同篇的時間未定列不會被過期', () => {
    const ended = row('w', { external_id: 'Wait0000001', status: 'ended', actual_start: AT_2100 });
    expect(mergePlan([timedPost('P1', 'post:P:1'), tbdPost, ended]).expire).not.toContain('P2');
  });

  it('T23 同篇的具體時間列不論狀態（例如已過期）都讓時間未定列不併', () => {
    const m = computeMerges([timedPost('P1', 'post:P:1', { status: 'expired' }), tbdPost, waiting]);
    expect(m.get('P2')).toBeNull();
  });

  it('T23 投稿來源（sub:<id>:<n>）同樣適用', () => {
    const sub1 = row('S1', { source: 'user_submission', external_id: 'sub:S:1', scheduled_start: AT_2100 });
    const sub2 = row('S2', { source: 'user_submission', external_id: 'sub:S:2', scheduled_start: TBD_1014, time_tbd: true });
    expect(computeMerges([sub1, sub2, waiting]).get('S2')).toBeNull();
  });

  it('T23 不同貼文的具體時間列不影響時間未定列合併', () => {
    const m = computeMerges([timedPost('Q1', 'post:Q:1'), tbdPost, waiting]);
    expect(m.get('P2')).toBe('w');
  });

  it('T23 同篇的具體時間列在別天時不影響時間未定列合併', () => {
    const otherDay = timedPost('P1', 'post:P:1', { scheduled_start: '2026-10-15T13:00:00.000Z' }); // 10/15 21:00
    expect(computeMerges([otherDay, tbdPost, waiting]).get('P2')).toBe('w');
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

  it('T26 合併讀取的欄位含 announced_at、created_at 與 external_id', async () => {
    const { db, calls } = mergeDb([], []);
    await applyMerges(db, emptyStats('live', NOW), NOW);
    const reads = calls.filter((c) => c.method === 'GET' && c.url.includes('/rest/v1/streams?'));
    expect(reads.length).toBeGreaterThan(0);
    for (const c of reads) {
      const cols = c.url.match(/select=([^&]*)/)?.[1].split(',') ?? [];
      expect(cols).toEqual(expect.arrayContaining(['announced_at', 'created_at', 'external_id']));
    }
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
