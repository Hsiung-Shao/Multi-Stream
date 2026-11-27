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

    it('掛載時有多個聊天室就收成一個、跟著舞台', () => {
        useStreamStore.setState({ canvasItems: [
            S('w1', 1, L(0, 0, 14, 24)), S('w2', 2, L(14, 0, 6, 24)),
            { i: 'c2', type: 'chat', contentId: 2, layout: L(20, 0, 4, 12) },
            { i: 'c1', type: 'chat', contentId: 1, layout: L(20, 12, 4, 12) },
        ] });
        renderHook(() => useRoomSync());
        const chats = useStreamStore.getState().canvasItems.filter(it => it.type === 'chat');
        expect(chats.map(c => [c.i, c.contentId, c.layout.h])).toEqual([['c2', 1, 24]]);
    });

    it('手動切聊天室頻道後調聊天室寬度不會被拉回舞台那路', () => {
        renderHook(() => useRoomSync());
        act(() => { useStreamStore.getState().updateCanvasItem('c1', { contentId: 2 }); });
        act(() => { useStreamStore.getState().setChatColumnWidth(6); });
        expect(useStreamStore.getState().canvasItems.find(it => it.i === 'c1')!.contentId).toBe(2);
    });

    it('主畫面經由其他操作換人時聊天室也跟過去', () => {
        renderHook(() => useRoomSync());
        act(() => { useStreamStore.getState().setMainCanvasItem('w2'); });
        expect(useStreamStore.getState().canvasItems.find(it => it.i === 'c1')!.contentId).toBe(2);
    });

    it('舞台換到 YouTube 時聊天離開合併，換回 Twitch 時回到合併', () => {
        useStreamStore.setState({ streams: [stream(1, false), { ...stream(2, false), platform: 'youtube', videoId: 'v2' }] });
        useUIStore.setState({ roomChatMerged: true });
        renderHook(() => useRoomSync());
        act(() => { focusRoomItem('w2'); });
        expect(useUIStore.getState().roomChatMerged).toBe(false);
        act(() => { focusRoomItem('w1'); });
        expect(useUIStore.getState().roomChatMerged).toBe(true);
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
        expect(layoutOf('w1')).toEqual(L(0, 0, 18, 24));  // 舞台佔滿串流區（2026-11-27 照原型）
        expect(layoutOf('w2')).toEqual(L(12, 0, 6, 24));
        expect(layoutOf('c1')).toEqual(L(18, 0, 6, 24));
    });

    it('保留空視窗模式下舞台那路變空槽時，改由有內容的那路上舞台', () => {
        renderHook(() => useRoomSync());
        act(() => {
            useStreamStore.setState({ canvasItems: [S('w1', null, L(0, 0, 14, 24)), S('w2', 2, L(14, 0, 6, 24)), stageItems()[2]] });
        });
        expect(layoutOf('w2')).toEqual(L(0, 0, 20, 24));  // 舞台佔滿串流區（2026-11-27 照原型）
    });

    it('全體靜音期間換了焦點，解除全體靜音後聲音跟上新焦點', () => {
        renderHook(() => useRoomSync());
        act(() => { useUIStore.setState({ masterMuted: true }); });
        act(() => { focusRoomItem('w2'); });
        act(() => { useUIStore.setState({ masterMuted: false }); });
        expect(mutedOf(2)).toBe(false);
        expect(mutedOf(1)).toBe(true);
    });

    it('舞台模式下新增聊天室後仍排回舞台', () => {
        renderHook(() => useRoomSync());
        act(() => { useStreamStore.getState().addCanvasItem('chat', null); });
        expect(layoutOf('w1')).toEqual(L(0, 0, 20, 24));  // 舞台佔滿串流區（2026-11-27 照原型）
        expect(layoutOf('w2')).toEqual(L(14, 0, 6, 24));
    });
});
