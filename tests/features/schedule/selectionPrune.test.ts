// 勾選的場次預定時間一過（卡片已從「接下來」消失）就從勾選拿掉；已開台的照留
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScheduleSelection } from '../../../src/features/schedule/useScheduleSelection';
import { isPastScheduled } from '../../../src/features/schedule/filters';
import { streamKey, type ScheduleStream } from '../../../src/features/schedule/types';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const s = (id: string, start: string, status: ScheduleStream['status'] = 'scheduled'): ScheduleStream => ({
    vtuber_id: 'v1', platform: 'youtube', external_id: id, source: 'yt_waiting_room', status, scheduled_start: start,
});

describe('useScheduleSelection.prune', () => {
    it('拿掉預定時間已過的勾選；已開台（同 key 出現在直播中）與還沒到的保留；沒有變動時不換 state', () => {
        const { result } = renderHook(() => useScheduleSelection({}, 'test'));
        const past = s('past', '2026-10-01T11:59:00Z');
        const wentLive = s('golive', '2026-10-01T11:50:00Z');
        const future = s('future', '2026-10-01T12:30:00Z');
        act(() => result.current.selectMany([past, wentLive, future]));
        expect(result.current.selected.size).toBe(3);

        const liveKeys = new Set([streamKey({ ...wentLive, status: 'live' })]);
        const keep = (x: ScheduleStream) => liveKeys.has(streamKey(x)) || !isPastScheduled(x, NOW);
        act(() => result.current.prune(keep));
        expect([...result.current.selected.keys()].sort()).toEqual([streamKey(wentLive), streamKey(future)].sort());

        const before = result.current.selected;
        act(() => result.current.prune(keep));
        expect(result.current.selected).toBe(before);
    });
});
