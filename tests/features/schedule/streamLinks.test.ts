// 沒有影片 ID 的場次（社群週表圖解析 community_post、使用者投稿 user_submission）：
// 連結與加入畫布退回頻道 /live、沒有縮圖；已在畫布上的判定改比頻道。
import { describe, expect, it } from 'vitest';
import { canvasInput, isNonVideoStream, thumbnailUrl, watchUrl } from '../../../src/features/schedule/streamLinks';
import { isOnCanvas } from '../../../src/features/schedule/useWatchOnCanvas';
import type { ScheduleChannel, ScheduleStream } from '../../../src/features/schedule/types';

const ch: ScheduleChannel = { name: '懶貓子', nationality: 'TW', youtube: 'UCswRX8mNNdn1fjRctZqzjgA', twitch: 'lanmewko' };
const post: ScheduleStream = { vtuber_id: 'v1', platform: 'youtube', external_id: 'post:UgkxArOhmT2c:1', source: 'community_post', status: 'scheduled', scheduled_start: '2026-10-06T12:00:00Z' };
const sub: ScheduleStream = { ...post, external_id: 'sub:9f1c0000-0000-0000-0000-000000000000:2', source: 'user_submission' };
const waiting: ScheduleStream = { ...post, external_id: 'dQw4w9WgXcQ', source: 'yt_waiting_room' };

describe('streamLinks：沒有影片 ID 的場次', () => {
  it('依來源或 external_id 前綴判定', () => {
    expect(isNonVideoStream(post)).toBe(true);
    expect(isNonVideoStream(sub)).toBe(true);
    expect(isNonVideoStream({ source: 'yt_waiting_room', external_id: 'post:x:1' })).toBe(true);
    expect(isNonVideoStream(waiting)).toBe(false);
  });

  it('YouTube：連到頻道 /live、沒有縮圖、加入畫布用頻道 /live；沒有頻道 ID 就 null', () => {
    expect(watchUrl(post, ch)).toBe('https://www.youtube.com/channel/UCswRX8mNNdn1fjRctZqzjgA/live');
    expect(canvasInput(sub, ch)).toBe('https://www.youtube.com/channel/UCswRX8mNNdn1fjRctZqzjgA/live');
    expect(thumbnailUrl(post, ch)).toBeNull();
    expect(watchUrl(post, { ...ch, youtube: undefined })).toBeNull();
    expect(canvasInput(post, undefined)).toBeNull();
    // 待機室照舊
    expect(watchUrl(waiting, ch)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(thumbnailUrl(waiting, ch)).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('Twitch 平台的社群場次沿用 login', () => {
    const tw: ScheduleStream = { ...post, platform: 'twitch' };
    expect(watchUrl(tw, ch)).toBe('https://www.twitch.tv/lanmewko');
    expect(canvasInput(tw, ch)).toBe('lanmewko');
  });

  it('isOnCanvas：社群場次比頻道，不比影片 ID', () => {
    const canvas = [{ platform: 'youtube' as const, channelId: 'UCswRX8mNNdn1fjRctZqzjgA', videoId: undefined }];
    expect(isOnCanvas(post, ch, canvas)).toBe(true);
    expect(isOnCanvas(waiting, ch, canvas)).toBe(false); // 排定中的待機室只比影片 ID
    expect(isOnCanvas({ ...waiting, status: 'live' }, ch, canvas)).toBe(true);
  });
});
