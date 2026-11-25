// review 第 1 輪重現：聲音跟著焦點不可在掛載時改靜音、全體靜音時不動、調聊天室寬度後維持舞台
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoomSync } from '../../src/components/Navigation/roomSync';
import { focusRoomItem } from '../../src/components/Navigation/roomActions';
import { useStreamStore } from '../../src/store/useStreamStore';
import { useUIStore } from '../../src/store/useUIStore';
import type { CanvasItem } from '../../src/types/canvas';
import type { StreamData } from '../../src/utils/streamUtils';

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const S = (i: string, contentId: number | null, layout: ReturnType<typeof L>): CanvasItem => ({ i, type: 'stream', contentId, layout });
const stream = (id: number, isMuted?: boolean): StreamData => ({
    id, platform: 'twitch', channelId: `ch${id}`, videoId: '', originalUrl: '', volume: 50, chatVisible: false, isMuted,
});
const mutedOf = (id: number) => useStreamStore.getState().streams.find(s => s.id === id)!.isMuted;
const layoutOf = (id: string) => useStreamStore.getState().canvasItems.find(it => it.i === id)!.layout;

/** 已是舞台版面：w1 舞台、w2 候場、聊天室 4 欄 */
const stageItems = (): CanvasItem[] => [
    S('w1', 1, L(0, 0, 14, 24)),
    S('w2', 2, L(14, 0, 6, 24)),
    { i: 'c1', type: 'chat', contentId: 1, layout: L(20, 0, 4, 24), sharedChat: true },
];

describe('useRoomSync', () => {
    beforeEach(() => {
        localStorage.clear();
        useUIStore.setState({ roomMode: 'stage', audioFollowsFocus: true, masterMuted: false });
        useStreamStore.setState({ canvasItems: stageItems(), streams: [stream(1, false), stream(2, false)], chatColumnWidth: 4 });
    });

    it('掛載時不改任何一路的靜音', () => {
        renderHook(() => useRoomSync());
        expect(mutedOf(1)).toBe(false);
        expect(mutedOf(2)).toBe(false);
    });

    it('主畫面換人後才讓聲音跟著焦點', () => {
        renderHook(() => useRoomSync());
        act(() => { focusRoomItem('w2'); });
        expect(mutedOf(2)).toBe(false);
        expect(mutedOf(1)).toBe(true);
    });

    it('全體靜音中換焦點不解除任何一路的靜音', () => {
        useUIStore.setState({ masterMuted: true });
        useStreamStore.setState({ streams: [stream(1, true), stream(2, true)] });
        renderHook(() => useRoomSync());
        act(() => { focusRoomItem('w2'); });
        expect(mutedOf(1)).toBe(true);
        expect(mutedOf(2)).toBe(true);
    });

    it('舞台模式下聊天室調寬後重新排成舞台', () => {
        renderHook(() => useRoomSync());
        act(() => { useStreamStore.getState().setChatColumnWidth(6); });
        expect(layoutOf('w1')).toEqual(L(0, 0, 12, 24));
        expect(layoutOf('w2')).toEqual(L(12, 0, 6, 24));
        expect(layoutOf('c1')).toEqual(L(18, 0, 6, 24));
    });

    it('保留空視窗模式下舞台那路變空槽時，改由有內容的那路上舞台', () => {
        renderHook(() => useRoomSync());
        act(() => {
            useStreamStore.setState({ canvasItems: [S('w1', null, L(0, 0, 14, 24)), S('w2', 2, L(14, 0, 6, 24)), stageItems()[2]] });
        });
        expect(layoutOf('w2')).toEqual(L(0, 0, 14, 24));
    });
});
