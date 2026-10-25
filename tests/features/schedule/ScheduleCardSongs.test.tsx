// 週表卡片的「歌單」徽章：只在有時間軸的 YouTube 場次顯示，連到 /songs?list=...
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import i18n from '../../../src/i18n/i18n';
import { SlotRow, RecentRow } from '../../../src/features/schedule/ScheduleCard';
import type { ScheduleStream } from '../../../src/features/schedule/types';

const NOW = Date.parse('2026-10-14T10:00:00+08:00');
const channel = { name: '台一', nationality: 'TW' } as never;
const yt: ScheduleStream = { vtuber_id: 'v1', platform: 'youtube', external_id: 'AbCdEfGhIjK', source: 'yt_waiting_room', status: 'scheduled', title: '歌回', scheduled_start: '2026-10-14T12:00:00.000Z' };
const tw: ScheduleStream = { ...yt, platform: 'twitch', external_id: '111', source: 'twitch_live' };
const ended: ScheduleStream = { ...yt, status: 'ended', actual_end: '2026-10-14T01:00:00.000Z' };
const SONGS = { codes: ['aaaaaaaa', 'bbbbbbbb'] };
const SONG_LINK = 'a[href="/songs?list=aaaaaaaa.bbbbbbbb"]';

function renderSlot(stream: ScheduleStream, songs?: { codes: string[] } | null) {
    return render(
        <ul>
            <SlotRow stream={stream} channel={channel} now={NOW} selected={false} onToggle={() => {}} songs={songs} />
        </ul>,
    );
}
function renderRecent(stream: ScheduleStream, songs?: { codes: string[] } | null) {
    return render(
        <ul>
            <RecentRow stream={stream} channel={channel} now={NOW} songs={songs} />
        </ul>,
    );
}

beforeEach(async () => {
    await i18n.changeLanguage('zh-TW');
});

describe('週表卡片歌單徽章', () => {
    it('YouTube 場次有時間軸 → 顯示連到 /songs?list= 的徽章', () => {
        expect(renderSlot(yt, SONGS).container.querySelector(SONG_LINK)).not.toBeNull();
    });

    it('已結束列（RecentRow）也顯示徽章', () => {
        expect(renderRecent(ended, SONGS).container.querySelector(SONG_LINK)).not.toBeNull();
    });

    it('songs 為 null 或沒給 → 不顯示', () => {
        expect(renderSlot(yt, null).container.querySelector('a[href^="/songs"]')).toBeNull();
        expect(renderSlot(yt).container.querySelector('a[href^="/songs"]')).toBeNull();
        expect(renderRecent(ended, null).container.querySelector('a[href^="/songs"]')).toBeNull();
    });

    it('Twitch 場次即使帶 songs 也不顯示', () => {
        expect(renderSlot(tw, SONGS).container.querySelector('a[href^="/songs"]')).toBeNull();
        expect(renderRecent({ ...tw, status: 'ended', actual_end: ended.actual_end }, SONGS).container.querySelector('a[href^="/songs"]')).toBeNull();
    });

    it('徽章文字不是未翻譯的 i18n key', () => {
        const link = renderSlot(yt, SONGS).container.querySelector(SONG_LINK);
        expect(link?.textContent?.trim()).toBeTruthy();
        expect(link?.textContent).not.toContain('songsBadge');
    });
});
