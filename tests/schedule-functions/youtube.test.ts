import { describe, expect, it } from 'vitest';
import { QuotaBudgetError, YouTubeClient, toYouTubeVideo } from '../../supabase/functions/_shared/youtube.ts';
import { classifyYouTubeVideo } from '../../supabase/functions/_shared/rules.ts';

const NOW = Date.parse('2026-09-28T12:00:00Z');

describe('videos.list 結果對應', () => {
  it('upcoming + scheduledStartTime → scheduled', () => {
    const v = toYouTubeVideo({
      id: 'AbCdEfGhIjK',
      snippet: { channelId: 'UCx', title: 't', liveBroadcastContent: 'upcoming', thumbnails: { high: { url: 'h' }, default: { url: 'd' } } },
      liveStreamingDetails: { scheduledStartTime: '2026-09-28T13:00:00Z' },
    });
    expect(v.thumbnailUrl).toBe('h');
    expect(classifyYouTubeVideo(v.facts, NOW)).toEqual({ kind: 'stream', status: 'scheduled', is_schedule_frame: false });
  });

  it('live + concurrentViewers → live 並帶觀看數', () => {
    const v = toYouTubeVideo({
      id: 'AbCdEfGhIjK',
      snippet: { liveBroadcastContent: 'live' },
      liveStreamingDetails: { scheduledStartTime: '2026-09-28T11:00:00Z', actualStartTime: '2026-09-28T11:02:00Z', concurrentViewers: '1234' },
    });
    expect(v.concurrentViewers).toBe(1234);
    expect(classifyYouTubeVideo(v.facts, NOW)).toEqual({ kind: 'stream', status: 'live', is_schedule_frame: false });
  });

  it('none + actualEndTime → ended', () => {
    const v = toYouTubeVideo({
      id: 'AbCdEfGhIjK',
      snippet: { liveBroadcastContent: 'none' },
      liveStreamingDetails: { actualStartTime: '2026-09-28T08:00:00Z', actualEndTime: '2026-09-28T10:00:00Z' },
    });
    expect(classifyYouTubeVideo(v.facts, NOW)).toEqual({ kind: 'stream', status: 'ended', is_schedule_frame: false });
  });

  it('none + 只有 scheduledStartTime（從未開播）→ canceled', () => {
    const v = toYouTubeVideo({
      id: 'AbCdEfGhIjK',
      snippet: { liveBroadcastContent: 'none' },
      liveStreamingDetails: { scheduledStartTime: '2026-09-01T08:00:00Z' },
    });
    expect(classifyYouTubeVideo(v.facts, NOW)).toEqual({ kind: 'stream', status: 'canceled', is_schedule_frame: false });
  });

  it('沒有 liveStreamingDetails 的一般上傳 → video（不進 streams）', () => {
    const v = toYouTubeVideo({ id: 'AbCdEfGhIjK', snippet: { liveBroadcastContent: 'none' } });
    expect(classifyYouTubeVideo(v.facts, NOW)).toEqual({ kind: 'video' });
  });

  it('排定時間超過 14 天 → 常駐框', () => {
    const v = toYouTubeVideo({
      id: 'AbCdEfGhIjK',
      snippet: { liveBroadcastContent: 'upcoming' },
      liveStreamingDetails: { scheduledStartTime: '2099-01-01T00:00:00Z' },
    });
    expect(classifyYouTubeVideo(v.facts, NOW)).toEqual({ kind: 'stream', status: 'scheduled', is_schedule_frame: true });
  });
});

describe('YouTubeClient', () => {
  it('每 50 支切一批、帶 Referer、配額計數；API 沒回的 id 不在 Map 裡', async () => {
    const calls: { url: string; referer: string | null }[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, referer: headers.get('Referer') });
      const ids = new URL(url).searchParams.get('id')!.split(',');
      // 只回前兩個，其他當作被刪除
      return new Response(JSON.stringify({ items: ids.slice(0, 2).map((id) => ({ id, snippet: { liveBroadcastContent: 'none' } })) }), { status: 200 });
    }) as unknown as typeof fetch;

    const yt = new YouTubeClient({ apiKey: 'k', referer: 'https://multistreaming.org', fetch: fetchFn });
    const ids = Array.from({ length: 120 }, (_, i) => `id${String(i).padStart(9, '0')}`);
    const result = await yt.listVideos(ids);
    expect(calls).toHaveLength(3);
    expect(calls[0].referer).toBe('https://multistreaming.org');
    expect(new URL(calls[0].url).searchParams.get('id')!.split(',')).toHaveLength(50);
    expect(new URL(calls[2].url).searchParams.get('id')!.split(',')).toHaveLength(20);
    expect(yt.quota.videosList).toBe(3);
    expect(yt.quota.units()).toBe(3);
    expect(result.size).toBe(6);
    expect(result.has(ids[0])).toBe(true);
    expect(result.has(ids[2])).toBe(false);
  });

  it('403（referer 被擋）丟出含狀態碼的錯誤', async () => {
    const fetchFn = (async () => new Response('{"error":{"message":"Requests from referer <empty> are blocked."}}', { status: 403 })) as unknown as typeof fetch;
    const yt = new YouTubeClient({ apiKey: 'k', referer: 'x', fetch: fetchFn });
    await expect(yt.listVideos(['AbCdEfGhIjK'])).rejects.toThrow(/HTTP 403/);
  });

  it('呼叫上限：remainingVideos＝剩餘次數 × 50；用完再呼叫丟 QuotaBudgetError（不會真的打出去）', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const yt = new YouTubeClient({ apiKey: 'k', referer: 'x', fetch: fetchFn, maxCalls: 2 });
    expect(yt.remainingVideos()).toBe(100);
    await yt.listVideos(Array.from({ length: 60 }, (_, i) => `v${String(i).padStart(10, '0')}`));
    expect(calls).toBe(2);
    expect(yt.remainingVideos()).toBe(0);
    await expect(yt.listVideos(['AbCdEfGhIjK'])).rejects.toBeInstanceOf(QuotaBudgetError);
    expect(calls).toBe(2);
    expect(new YouTubeClient({ apiKey: 'k', referer: 'x', fetch: fetchFn, maxCalls: 0 }).remainingVideos()).toBe(0);
  });
});
