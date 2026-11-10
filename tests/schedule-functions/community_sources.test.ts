// 社群週表（community_post）與使用者投稿（user_submission）：沒有影片 ID 的來源在排程裡的行為。
//   - 合併規則（含時間未定、announced_at、同來源同日）已搬到 supabase/tests/schedule_merge_apply.sql（規則唯一來源在 schedule_merge_apply）
//   - 重查／共享表：loadPendingYouTube 只查待機室；loadCurrentByChannel 排除這兩種來源（external_id 不是 videoId）
// T 編號對應計畫〈社群週表讀圖排程調整〉的測試規格表
import { describe, expect, it } from 'vitest';
import { expireOverdue, loadCurrentByChannel, loadPendingYouTube } from '../../supabase/functions/_shared/sweep.ts';
import { Db } from '../../supabase/functions/_shared/db.ts';
import { emptyStats } from '../../supabase/functions/_shared/types.ts';

const T0 = Date.parse('2026-10-06T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

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
