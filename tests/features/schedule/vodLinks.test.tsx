// 已結束場次的回放連結：vodUrl／watchUrl 的規則，以及 RecentRow 的連結與「VOD 不可用」標示
// V 編號對應計畫〈VOD 連結〉的測試規格表
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import i18n from '../../../src/i18n/i18n';
import { vodUrl, watchUrl } from '../../../src/features/schedule/streamLinks';
import { RecentRow } from '../../../src/features/schedule/ScheduleCard';
import type { ScheduleChannel, ScheduleStream } from '../../../src/features/schedule/types';

const ch: ScheduleChannel = { name: '台一', nationality: 'TW', youtube: 'UCswRX8mNNdn1fjRctZqzjgA', twitch: 'lanmewko' };
const YT_STREAMS = 'https://www.youtube.com/channel/UCswRX8mNNdn1fjRctZqzjgA/streams';
const TW_VIDEOS = 'https://www.twitch.tv/lanmewko/videos';

const ytEnded: ScheduleStream = {
    vtuber_id: 'v1',
    platform: 'youtube',
    external_id: 'AbCdEfGhIjK',
    source: 'yt_waiting_room',
    status: 'ended',
    title: '昨晚歌回',
    actual_end: '2026-10-14T01:00:00.000Z',
};
const twEnded: ScheduleStream = { ...ytEnded, platform: 'twitch', external_id: '111', source: 'twitch_live' };

describe('vodUrl：YouTube', () => {
    it('一般情況連到該支影片', () => {
        expect(vodUrl(ytEnded, ch)).toBe('https://www.youtube.com/watch?v=AbCdEfGhIjK');
        expect(vodUrl({ ...ytEnded, vod_status: 'ok' }, ch)).toBe('https://www.youtube.com/watch?v=AbCdEfGhIjK');
    });

    it('vod_status 為 missing → 連到頻道影片列表，不連已消失的影片', () => {
        expect(vodUrl({ ...ytEnded, vod_status: 'missing' }, ch)).toBe(YT_STREAMS);
    });

    it('missing 但沒有頻道 ID → null', () => {
        expect(vodUrl({ ...ytEnded, vod_status: 'missing' }, { ...ch, youtube: undefined })).toBeNull();
        expect(vodUrl({ ...ytEnded, vod_status: 'missing' }, undefined)).toBeNull();
    });

    it('沒有影片 ID 的來源（社群週表圖）結束後連頻道的直播列表 /streams', () => {
        const post: ScheduleStream = { ...ytEnded, external_id: 'post:UgkxArOhmT2c:1', source: 'community_post' };
        expect(vodUrl(post, ch)).toBe('https://www.youtube.com/channel/UCswRX8mNNdn1fjRctZqzjgA/streams');
    });
});

describe('vodUrl：Twitch', () => {
    it('有 vod_id → 連到該支 VOD', () => {
        expect(vodUrl({ ...twEnded, vod_status: 'ok', vod_id: '2345' }, ch)).toBe('https://www.twitch.tv/videos/2345');
    });

    it('missing 或沒有 vod_id（unknown）→ 連到頻道 /videos', () => {
        expect(vodUrl({ ...twEnded, vod_status: 'missing' }, ch)).toBe(TW_VIDEOS);
        expect(vodUrl(twEnded, ch)).toBe(TW_VIDEOS);
    });

    it('沒有 Twitch login → null', () => {
        expect(vodUrl(twEnded, { ...ch, twitch: undefined })).toBeNull();
        expect(vodUrl(twEnded, undefined)).toBeNull();
    });
});

describe('watchUrl：依狀態分流', () => {
    it('ended 場次回傳 vodUrl 的結果', () => {
        expect(watchUrl({ ...twEnded, vod_status: 'ok', vod_id: '2345' }, ch)).toBe('https://www.twitch.tv/videos/2345');
        expect(watchUrl({ ...ytEnded, vod_status: 'missing' }, ch)).toBe(YT_STREAMS);
    });

    it('live／scheduled 行為不變（Twitch 連頻道、YouTube 連影片）', () => {
        expect(watchUrl({ ...twEnded, status: 'live', vod_id: '2345' }, ch)).toBe('https://www.twitch.tv/lanmewko');
        expect(watchUrl({ ...ytEnded, status: 'scheduled' }, ch)).toBe('https://www.youtube.com/watch?v=AbCdEfGhIjK');
    });
});

describe('RecentRow：回放連結', () => {
    const NOW = Date.parse('2026-10-14T10:00:00+08:00');
    const channel = { name: '台一', nationality: 'TW', youtube: 'UCswRX8mNNdn1fjRctZqzjgA', twitch: 'lanmewko' } as never;

    function renderRecent(stream: ScheduleStream) {
        return render(
            <ul>
                <RecentRow stream={stream} channel={channel} now={NOW} />
            </ul>,
        );
    }

    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
    });

    it('標題是新分頁開啟的連結，指向該支影片', () => {
        const { container } = renderRecent(ytEnded);
        const a = container.querySelector('a[href="https://www.youtube.com/watch?v=AbCdEfGhIjK"]');
        expect(a).not.toBeNull();
        expect(a?.getAttribute('target')).toBe('_blank');
        expect(a?.textContent).toContain('昨晚歌回');
        expect(container.textContent).not.toContain('VOD 不可用');
    });

    it('Twitch 有 vod_id → 連到 /videos/<id>', () => {
        const { container } = renderRecent({ ...twEnded, vod_status: 'ok', vod_id: '2345' });
        expect(container.querySelector('a[href="https://www.twitch.tv/videos/2345"]')).not.toBeNull();
    });

    it('missing → 顯示「VOD 不可用」且連結改指頻道影片列表', () => {
        const { container } = renderRecent({ ...ytEnded, vod_status: 'missing' });
        expect(container.textContent).toContain('VOD 不可用');
        expect(container.querySelector(`a[href="${YT_STREAMS}"]`)).not.toBeNull();
        expect(container.querySelector('a[href="https://www.youtube.com/watch?v=AbCdEfGhIjK"]')).toBeNull();
    });

    it('「VOD 不可用」文字不是未翻譯的 i18n key', () => {
        const { container } = renderRecent({ ...twEnded, vod_status: 'missing' });
        expect(container.textContent).not.toContain('vodUnavailable');
        expect(container.textContent).toContain('VOD 不可用');
    });
});
