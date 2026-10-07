// 社群週表（community_post）與使用者投稿（user_submission）：沒有影片 ID 的來源在排程裡的行為。
//   - 合併：任何真實場次（待機室／直播／Twitch）出現在 30 分鐘內就把它併掉；兩個沒有影片 ID 的場次互不合併
//   - 重查／共享表：loadPendingYouTube 只查待機室；loadCurrentByChannel 排除這兩種來源（external_id 不是 videoId）
import { describe, expect, it } from 'vitest';
import { canMerge, computeMerges, type MergeInput } from '../../supabase/functions/_shared/merge.ts';
import { expireOverdue, loadCurrentByChannel, loadPendingYouTube } from '../../supabase/functions/_shared/sweep.ts';
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
    const expire = urls.find((u) => u.includes('status=eq.scheduled&actual_start=is.null'));
    expect(expire).toBeDefined();
    expect(expire).toContain('or=(platform.eq.youtube,source.in.(community_post,user_submission))');
  });
});
