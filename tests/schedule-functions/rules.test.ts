import { describe, expect, it } from 'vitest';
import {
  computeTier,
  EXPIRE_AFTER_HOURS,
  isExpired,
  isRecentForSnapshot,
  isScheduleFrame,
  isUpcomingForSnapshot,
  SCHEDULE_FRAME_DAYS,
  shouldUseApiFallback,
} from '../../supabase/functions/_shared/rules.ts';
import { buildLiveStatusRow } from '../../supabase/functions/_shared/live_status.ts';
import { buildSnapshot } from '../../supabase/functions/_shared/snapshot.ts';
import type { StreamRecord } from '../../supabase/functions/_shared/types.ts';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const DAY = 86_400_000;
const HOUR = 3_600_000;

describe('常駐框（14 天）', () => {
  it('剛好 14 天不算，超過才算', () => {
    expect(SCHEDULE_FRAME_DAYS).toBe(14);
    expect(isScheduleFrame(new Date(NOW + 14 * DAY).toISOString(), NOW)).toBe(false);
    expect(isScheduleFrame(new Date(NOW + 14 * DAY + 1000).toISOString(), NOW)).toBe(true);
    expect(isScheduleFrame('2099-01-01T00:00:00Z', NOW)).toBe(true);
    expect(isScheduleFrame(null, NOW)).toBe(false);
    expect(isScheduleFrame('not a date', NOW)).toBe(false);
  });
});

describe('過期（排定後 3 小時未開始）', () => {
  it('scheduled 且超過 3 小時 → 過期；已開播或非 scheduled 不算', () => {
    expect(EXPIRE_AFTER_HOURS).toBe(3);
    const base = { status: 'scheduled' as const, scheduled_start: new Date(NOW - 3 * HOUR - 1).toISOString(), actual_start: null };
    expect(isExpired(base, NOW)).toBe(true);
    expect(isExpired({ ...base, scheduled_start: new Date(NOW - 3 * HOUR + 60_000).toISOString() }, NOW)).toBe(false);
    expect(isExpired({ ...base, actual_start: '2026-09-28T08:00:00Z' }, NOW)).toBe(false);
    expect(isExpired({ ...base, status: 'live' }, NOW)).toBe(false);
    expect(isExpired({ ...base, scheduled_start: null }, NOW)).toBe(false);
  });
});

describe('分級', () => {
  it('graduate 不分級', () => {
    expect(computeTier({ activity: 'graduate', videoCountNow: 10, videoCount30: 5, videoCount90: 1 }, NOW)).toBeNull();
  });
  it('30 天內 video_count 增加 → T1；31～90 天 → T2；都沒增加 → T3', () => {
    expect(computeTier({ activity: 'active', videoCountNow: 10, videoCount30: 9, videoCount90: 5 }, NOW)?.tier).toBe(1);
    expect(computeTier({ activity: 'active', videoCountNow: 10, videoCount30: 10, videoCount90: 5 }, NOW)?.tier).toBe(2);
    expect(computeTier({ activity: 'active', videoCountNow: 10, videoCount30: 10, videoCount90: 10 }, NOW)?.tier).toBe(3);
  });
  it('RSS 觀察到的新影片可立即升級：30 天內 → T1，90 天內 → T2', () => {
    const inactive = { activity: 'active', videoCountNow: 10, videoCount30: 10, videoCount90: 10 };
    expect(computeTier({ ...inactive, lastNewVideoAt: new Date(NOW - 2 * DAY).toISOString() }, NOW)?.tier).toBe(1);
    expect(computeTier({ ...inactive, lastNewVideoAt: new Date(NOW - 60 * DAY).toISOString() }, NOW)?.tier).toBe(2);
    expect(computeTier({ ...inactive, lastNewVideoAt: new Date(NOW - 120 * DAY).toISOString() }, NOW)?.tier).toBe(3);
  });
  it('沒有切面資料的新頻道先當 T2 觀察', () => {
    expect(computeTier({ activity: 'active', videoCountNow: null, videoCount30: null, videoCount90: null }, NOW)).toEqual({ tier: 2, reason: 'no_metrics' });
    expect(computeTier({ activity: 'preparing', videoCountNow: 3, videoCount30: null, videoCount90: null }, NOW)?.tier).toBe(2);
  });
  it('RSS 連續失敗 3 次改走 API 備援', () => {
    expect(shouldUseApiFallback(2)).toBe(false);
    expect(shouldUseApiFallback(3)).toBe(true);
  });
});

function stream(partial: Partial<StreamRecord>): StreamRecord {
  return {
    id: partial.id ?? 'id',
    vtuber_id: 'v1',
    channel_id: 'c1',
    platform: 'youtube',
    external_id: 'AbCdEfGhIjK',
    source: 'yt_waiting_room',
    status: 'scheduled',
    scheduled_start: null,
    scheduled_end: null,
    actual_start: null,
    actual_end: null,
    title: null,
    category: null,
    thumbnail_url: null,
    viewer_count: null,
    is_schedule_frame: false,
    fetched_at: new Date(NOW).toISOString(),
    ...partial,
  };
}

describe('snapshot 視窗', () => {
  it('upcoming：未來 7 天內、非常駐框、scheduled；recent：24 小時內結束', () => {
    expect(isUpcomingForSnapshot(stream({ scheduled_start: new Date(NOW + DAY).toISOString() }), NOW)).toBe(true);
    expect(isUpcomingForSnapshot(stream({ scheduled_start: new Date(NOW + 8 * DAY).toISOString() }), NOW)).toBe(false);
    expect(isUpcomingForSnapshot(stream({ scheduled_start: new Date(NOW + DAY).toISOString(), is_schedule_frame: true }), NOW)).toBe(false);
    expect(isRecentForSnapshot(stream({ status: 'ended', actual_end: new Date(NOW - 2 * HOUR).toISOString() }), NOW)).toBe(true);
    expect(isRecentForSnapshot(stream({ status: 'ended', actual_end: new Date(NOW - 30 * HOUR).toISOString() }), NOW)).toBe(false);
  });

  it('buildSnapshot：分三桶、null 時間欄位省略、hidden 與常駐框不進、channels 只含有場次的實況主', () => {
    const streams = [
      stream({ id: 'a', status: 'live', actual_start: new Date(NOW - HOUR).toISOString(), viewer_count: 10 }),
      stream({ id: 'b', status: 'scheduled', scheduled_start: new Date(NOW + 2 * HOUR).toISOString(), vtuber_id: 'v2', external_id: 'BbBbBbBbBbB' }),
      stream({ id: 'c', status: 'ended', actual_end: new Date(NOW - HOUR).toISOString(), external_id: 'CcCcCcCcCcC' }),
      stream({ id: 'd', status: 'hidden', external_id: 'DdDdDdDdDdD' }),
      stream({ id: 'e', status: 'scheduled', is_schedule_frame: true, scheduled_start: '2099-01-01T00:00:00Z', external_id: 'EeEeEeEeEeE', vtuber_id: 'v3' }),
      stream({ id: 'f', platform: 'twitch', source: 'twitch_live', status: 'live', external_id: '123', vtuber_id: 'v4' }),
    ];
    const vtubers = [
      { id: 'v1', name: '一號', img_url: 'https://img/1', nationality: 'TW', group_id: 'g1', youtube_channel_id: 'UC1', twitch_channel_id: null },
      { id: 'v2', name: '二號', img_url: null, nationality: 'JP', group_id: null, youtube_channel_id: 'UC2', twitch_channel_id: 'two' },
      { id: 'v3', name: '三號', img_url: null, nationality: 'TW', group_id: null, youtube_channel_id: 'UC3', twitch_channel_id: null },
      { id: 'v4', name: '四號', img_url: null, nationality: 'TW', group_id: null, youtube_channel_id: null, twitch_channel_id: 'four' },
    ];
    const snap = buildSnapshot(streams, vtubers, new Map([['g1', '某團']]), NOW, null);
    expect(snap.version).toBe(1);
    expect('heavy_refreshed_at' in snap).toBe(false);
    expect(snap.live.map((s) => s.id)).toEqual(['a', 'f']);
    expect(snap.upcoming.map((s) => s.id)).toEqual(['b']);
    expect(snap.recent.map((s) => s.id)).toEqual(['c']);
    expect(Object.keys(snap.channels).sort()).toEqual(['v1', 'v2', 'v4']);
    expect(snap.channels.v1).toEqual({ name: '一號', avatar: 'https://img/1', group: '某團', nationality: 'TW', youtube: 'UC1' });
    expect(snap.channels.v2).toEqual({ name: '二號', nationality: 'JP', youtube: 'UC2', twitch: 'two' });
    const live = snap.live[0];
    expect(live.url).toBe('https://www.youtube.com/watch?v=AbCdEfGhIjK');
    expect('scheduled_start' in live).toBe(false);
    expect('actual_end' in live).toBe(false);
    expect(snap.live[1].url).toBe('https://www.twitch.tv/four');
    expect('title' in snap.upcoming[0]).toBe(false);
  });
});

describe('youtube_live_status 列', () => {
  const ch = { externalId: 'UCxxxxxxxxxxxxxxxxxxxxxx', displayName: '頻道名' };
  it('直播中優先', () => {
    const row = buildLiveStatusRow(ch, [stream({ status: 'scheduled', scheduled_start: '2026-09-29T00:00:00Z' }), stream({ status: 'live', external_id: 'LiveLiveLiv' })], NOW);
    expect(row).toMatchObject({ channel_id: ch.externalId, is_live: true, is_upcoming: false, is_schedule_frame: false, video_id: 'LiveLiveLiv', channel_title: '頻道名' });
  });
  it('多個待機室取最近的一個；常駐框只有在沒有待機室時才標', () => {
    const row = buildLiveStatusRow(
      ch,
      [
        stream({ status: 'scheduled', scheduled_start: '2026-09-30T00:00:00Z', external_id: 'LaterLaterL' }),
        stream({ status: 'scheduled', scheduled_start: '2026-09-29T00:00:00Z', external_id: 'SoonSoonSoo' }),
        stream({ status: 'scheduled', is_schedule_frame: true, scheduled_start: '2099-01-01T00:00:00Z', external_id: 'FrameFrameF' }),
      ],
      NOW,
    );
    expect(row).toMatchObject({ is_live: false, is_upcoming: true, is_schedule_frame: false, video_id: 'SoonSoonSoo', scheduled_start_at: '2026-09-29T00:00:00Z' });
    const frameOnly = buildLiveStatusRow(ch, [stream({ status: 'scheduled', is_schedule_frame: true, scheduled_start: '2099-01-01T00:00:00Z' })], NOW);
    expect(frameOnly).toMatchObject({ is_upcoming: false, is_schedule_frame: true });
  });
  it('沒有場次 → 全 false、video_id null', () => {
    const row = buildLiveStatusRow(ch, [], NOW);
    expect(row).toMatchObject({ is_live: false, is_upcoming: false, is_schedule_frame: false, video_id: null, scheduled_start_at: null });
    expect(row.checked_at).toBe(new Date(NOW).toISOString());
  });
});
