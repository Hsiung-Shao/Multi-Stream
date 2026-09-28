import { describe, expect, it } from 'vitest';
import { loadPendingYouTube, rssSweep, writeChannelStates } from '../../supabase/functions/_shared/sweep.ts';
import { Db } from '../../supabase/functions/_shared/db.ts';
import { YouTubeClient } from '../../supabase/functions/_shared/youtube.ts';
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

describe('writeChannelStates：依欄位集分組 upsert', () => {
  it('失敗列不帶 rss_last_ok_at，不會被補 null 覆寫；每批欄位集一致且都含 tier', async () => {
    const { db, calls } = fakeDb((url) => {
      if (url.includes('schedule_channel_state?select=channel_id,tier')) {
        return new Response(JSON.stringify([{ channel_id: 'c1', tier: 3 }, { channel_id: 'c2', tier: 1 }]), { status: 200 });
      }
      return new Response('', { status: 201 });
    });
    await writeChannelStates(db, [
      { channel_id: 'c1', rss_fail_streak: 0, rss_last_ok_at: 'T', rss_last_error: null, last_checked_at: 'T' },
      { channel_id: 'c2', rss_fail_streak: 2, rss_last_error: 'timeout', last_checked_at: 'T' },
      { channel_id: 'c3', rss_fail_streak: 0, rss_last_ok_at: 'T', rss_last_error: null, last_checked_at: 'T' },
    ]);
    const upserts = calls.filter((c) => c.method === 'POST').map((c) => c.body as Record<string, unknown>[]);
    expect(upserts).toHaveLength(3); // 成功列（既有）、失敗列、新列（帶 tier_reason）三種欄位集
    for (const batch of upserts) {
      const sig = Object.keys(batch[0]).sort().join(',');
      for (const row of batch) {
        expect(Object.keys(row).sort().join(',')).toBe(sig);
        expect(typeof row.tier).toBe('number');
      }
    }
    const failed = upserts.flat().find((r) => r.channel_id === 'c2')!;
    expect('rss_last_ok_at' in failed).toBe(false);
    expect(failed.tier).toBe(1);
    const fresh = upserts.flat().find((r) => r.channel_id === 'c3')!;
    expect(fresh).toMatchObject({ tier: 2, tier_reason: 'first_seen' });
  });
});

describe('rssSweep：429 與死頻道', () => {
  const yt = new YouTubeClient({ apiKey: 'k', referer: 'r', fetch: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch });

  it('429 的頻道不算已處理、不加 fail streak，且本輪停止開始新頻道', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n += 1;
      return new Response('slow down', { status: 429 });
    }) as unknown as typeof fetch;
    const stats = emptyStats('light', NOW);
    const r = await rssSweep([channel(1, 2), channel(2), channel(3)], yt, { concurrency: 1, deadline: { at: Date.now() + 60_000 }, fetch: fetchFn, stats, now: NOW });
    expect(n).toBe(1);
    expect(r.processed).toHaveLength(0);
    expect(stats.rss_rate_limited).toBe(1);
    expect(stats.rss_failed).toBe(0);
    expect(r.stateUpdates).toEqual([{ channel_id: 'c1', rss_fail_streak: 2, rss_last_error: 'http 429', last_checked_at: new Date(NOW).toISOString() }]);
  });

  it('連續失敗達 10 次的死頻道跳過不打 RSS，但算已處理讓游標前進', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n += 1;
      return new Response('<feed></feed>', { status: 200 });
    }) as unknown as typeof fetch;
    const stats = emptyStats('light', NOW);
    const r = await rssSweep([channel(1, 10), channel(2)], yt, { concurrency: 2, deadline: { at: Date.now() + 60_000 }, fetch: fetchFn, stats, now: NOW });
    expect(n).toBe(1);
    expect(r.processed.map((c) => c.channelId).sort()).toEqual(['c1', 'c2']);
    expect(stats.rss_skipped_dead).toBe(1);
    expect(stats.rss_ok).toBe(1);
  });
});

describe('loadPendingYouTube：三種範圍的查詢條件', () => {
  it('frames 含常駐框與沒有排定時間的待機室；all 排除兩者；near 只看直播中與 2 小時內', async () => {
    const { db, calls } = fakeDb(() => new Response('[]', { status: 200 }));
    await loadPendingYouTube(db, NOW, 'frames');
    await loadPendingYouTube(db, NOW, 'all');
    await loadPendingYouTube(db, NOW, 'near');
    const [frames, all, near] = calls.map((c) => decodeURIComponent(c.url));
    expect(frames).toContain('status=eq.scheduled&or=(is_schedule_frame.eq.true,scheduled_start.is.null)');
    expect(all).toContain('is_schedule_frame=eq.false&or=(status.eq.live,and(status.eq.scheduled,scheduled_start.not.is.null))');
    expect(near).toContain('is_schedule_frame=eq.false&or=(status.eq.live,and(status.eq.scheduled,scheduled_start.lte.2026-09-28T14:00:00.000Z))');
    for (const u of [frames, all, near]) expect(u).toContain('fetched_at=lt.2026-09-28T12:00:00.000Z');
  });
});
