// ogSweep 帶回「寫入後的現況」（schedule-live 寫共享表直接用，不再重查 streams）：必須等於寫完再查一次的結果。
import { describe, expect, it } from 'vitest';
import { Db } from '../../supabase/functions/_shared/db.ts';
import { ogSweep } from '../../supabase/functions/_shared/sweep.ts';
import { emptyStats, type RosterChannel } from '../../supabase/functions/_shared/types.ts';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const UC = 'UC0000000000000000000001';

const stream = (p: Record<string, unknown>) => ({
  id: 'x', vtuber_id: 'v1', channel_id: 'c1', platform: 'youtube', external_id: 'Vid00000001', source: 'yt_waiting_room',
  status: 'scheduled', scheduled_start: null, scheduled_end: null, actual_start: null, actual_end: null, title: 't',
  category: null, thumbnail_url: null, viewer_count: null, is_schedule_frame: false, fetched_at: '2026-10-09T11:00:00Z', ...p,
});

describe('ogSweep 的 current', () => {
  it('下播確認的直播從現況移除，其他待機室保留；只查一次現況', async () => {
    const live = stream({ id: 'a', external_id: 'LiveVid0001', status: 'live', actual_start: '2026-10-09T10:00:00Z' });
    const frame = stream({ id: 'b', external_id: 'FrameVid001', status: 'scheduled', is_schedule_frame: true, scheduled_start: '2027-01-01T00:00:00Z' });
    const calls: { url: string; method: string }[] = [];
    const dbFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      if (method === 'GET' && url.includes('status=in.(scheduled,live)')) return new Response(JSON.stringify([live, frame]), { status: 200 });
      if (method === 'GET') return new Response('[]', { status: 200 });
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    // /live 頁：自己頻道、沒有直播
    const ogFetch = (async (input: string | URL | Request) => {
      if (String(input).includes('i.ytimg.com')) return new Response(null, { status: 404 });
      return new Response(`<html><head><meta property="og:image" content="https://yt3.ggpht.com/avatar"><meta property="og:title" content="x"></head><body>"channelId":"${UC}"</body></html>`, { status: 200 });
    }) as unknown as typeof fetch;
    const db = new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: dbFetch });
    const ch: RosterChannel = { channelId: 'c1', vtuberId: 'v1', platform: 'youtube', externalId: UC, displayName: null, tier: 1, rssFailStreak: 0, ogMissStreak: 1 };
    const r = await ogSweep(db, [ch], emptyStats('live', NOW), NOW, { concurrency: 1, deadline: { at: Date.now() + 60_000 }, maxChannels: 10, fetch: ogFetch });

    // 前提：這輪確實把直播標成 ended（第二次沒看到直播）
    expect(r.checked.map((c) => c.channelId)).toEqual(['c1']);
    expect(r.current.get('c1')?.map((s) => s.external_id)).toEqual(['FrameVid001']);
    expect(calls.filter((c) => c.method === 'GET' && c.url.includes('status=in.(scheduled,live)'))).toHaveLength(1);
  });
});
