// focusRoomItem：房間模式下把某個視窗設為焦點（舞台重排／平分互換）＋聲音跟著焦點
import { describe, it, expect, beforeEach } from 'vitest';
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
const layoutOf = (id: string) => useStreamStore.getState().canvasItems.find(it => it.i === id)!.layout;
const mutedOf = (id: number) => useStreamStore.getState().streams.find(s => s.id === id)!.isMuted;

/** 平分版面：w1 是主畫面（面積最大），w2、w3 在右側 */
const gridItems = (): CanvasItem[] => [
    S('w1', 1, L(0, 0, 16, 24)),
    S('w2', 2, L(16, 0, 8, 12)),
    S('w3', 3, L(16, 12, 8, 12)),
];

describe('focusRoomItem', () => {
    beforeEach(() => {
        localStorage.clear();
        useUIStore.setState({ roomMode: 'stage', audioFollowsFocus: true });
        useStreamStore.setState({
            canvasItems: [],
            streams: [stream(1, false), stream(2, true), stream(3, true)],
            chatColumnWidth: 6,
        });
    });

    describe('舞台模式', () => {
        it('三路加聊天室時，把 w2 設為焦點：w2 變大舞台、其他疊在候場欄、聊天室在右欄', () => {
            useStreamStore.setState({
                canvasItems: [
                    S('w1', 1, L(0, 0, 8, 12)), S('w2', 2, L(8, 0, 8, 12)), S('w3', 3, L(0, 12, 8, 12)),
                    { i: 'c1', type: 'chat', contentId: 1, layout: L(16, 0, 8, 24), sharedChat: true },
                ],
            });
            focusRoomItem('w2');
            expect(layoutOf('w2')).toEqual(L(0, 0, 12, 24));
            expect(layoutOf('w1')).toEqual(L(12, 0, 6, 12));
            expect(layoutOf('w3')).toEqual(L(12, 12, 6, 12));
            expect(layoutOf('c1')).toEqual(L(18, 0, 6, 24));
        });

        it('沒有聊天室時，焦點寬 18、候場欄在 x=18', () => {
            useStreamStore.setState({ canvasItems: [S('w1', 1, L(0, 0, 12, 24)), S('w2', 2, L(12, 0, 12, 24))] });
            focusRoomItem('w2');
            expect(layoutOf('w2')).toEqual(L(0, 0, 18, 24));
            expect(layoutOf('w1')).toEqual(L(18, 0, 6, 24));
        });

        it('stageLayout 回傳 null（其他串流超過 4 路）時版面完全不動', () => {
            const items = Array.from({ length: 6 }, (_, k) => S(`w${k + 1}`, k + 1, L(k * 4, 0, 4, 24)));
            useStreamStore.setState({ canvasItems: items });
            const before = JSON.parse(JSON.stringify(items));
            focusRoomItem('w1');
            expect(useStreamStore.getState().canvasItems).toEqual(before);
        });

        it('找不到的 item id 時版面不動', () => {
            useStreamStore.setState({ canvasItems: gridItems() });
            focusRoomItem('不存在');
            expect(useStreamStore.getState().canvasItems).toEqual(gridItems());
        });
    });

    describe('平分模式', () => {
        beforeEach(() => useUIStore.setState({ roomMode: 'grid' }));

        it('把 w2 設為焦點時，與目前主畫面 w1 互換位置與尺寸', () => {
            useStreamStore.setState({ canvasItems: gridItems() });
            focusRoomItem('w2');
            expect(layoutOf('w2')).toEqual(L(0, 0, 16, 24));
            expect(layoutOf('w1')).toEqual(L(16, 0, 8, 12));
        });

        it('互換時其他視窗的版面不動', () => {
            useStreamStore.setState({ canvasItems: gridItems() });
            focusRoomItem('w2');
            expect(layoutOf('w3')).toEqual(L(16, 12, 8, 12));
        });

        it('焦點本來就是主畫面時版面不動', () => {
            useStreamStore.setState({ canvasItems: gridItems() });
            focusRoomItem('w1');
            expect(useStreamStore.getState().canvasItems).toEqual(gridItems());
        });

        it('選 w3 時 w3 取代主畫面位置、不會被改寫成舞台排法', () => {
            useStreamStore.setState({ canvasItems: gridItems() });
            focusRoomItem('w3');
            expect(layoutOf('w3')).toEqual(L(0, 0, 16, 24));
            expect(layoutOf('w2')).toEqual(L(16, 0, 8, 12));
        });
    });

    describe('聲音跟著焦點', () => {
        it('開啟時：焦點那路取消靜音、其他路全部靜音（舞台模式）', () => {
            useStreamStore.setState({ canvasItems: [S('w1', 1, L(0, 0, 8, 24)), S('w2', 2, L(8, 0, 8, 24)), S('w3', 3, L(16, 0, 8, 24))] });
            focusRoomItem('w2');
            expect(mutedOf(2)).toBe(false);
            expect(mutedOf(1)).toBe(true);
            expect(mutedOf(3)).toBe(true);
        });

        it('開啟時：平分模式換焦點同樣切換聲音', () => {
            useUIStore.setState({ roomMode: 'grid' });
            useStreamStore.setState({ canvasItems: gridItems() });
            focusRoomItem('w3');
            expect(mutedOf(3)).toBe(false);
            expect(mutedOf(1)).toBe(true);
            expect(mutedOf(2)).toBe(true);
        });

        it('關閉時：不動任何一路的 isMuted', () => {
            useUIStore.setState({ audioFollowsFocus: false });
            useStreamStore.setState({
                canvasItems: [S('w1', 1, L(0, 0, 8, 24)), S('w2', 2, L(8, 0, 8, 24)), S('w3', 3, L(16, 0, 8, 24))],
                streams: [stream(1, false), stream(2, true), stream(3, false)],
            });
            focusRoomItem('w2');
            expect(mutedOf(1)).toBe(false);
            expect(mutedOf(2)).toBe(true);
            expect(mutedOf(3)).toBe(false);
        });

        it('焦點那路本來就是唯一有聲音時，聲音狀態維持（焦點有聲、其他靜音）', () => {
            useStreamStore.setState({ canvasItems: [S('w1', 1, L(0, 0, 12, 24)), S('w2', 2, L(12, 0, 12, 24))] });
            focusRoomItem('w1');
            expect(mutedOf(1)).toBe(false);
            expect(mutedOf(2)).toBe(true);
        });
    });
});

describe('focusRoomItem：聊天室跟著舞台', () => {
    beforeEach(() => {
        localStorage.clear();
        useUIStore.setState({ roomMode: 'stage', audioFollowsFocus: true });
        useStreamStore.setState({
            streams: [stream(1, false), stream(2, true), stream(3, true)],
            chatColumnWidth: 6,
            canvasItems: [
                S('w1', 1, L(0, 0, 8, 12)), S('w2', 2, L(8, 0, 8, 12)), S('w3', 3, L(0, 12, 8, 12)),
                { i: 'c1', type: 'chat', contentId: 1, layout: L(16, 0, 8, 24), sharedChat: true },
            ],
        });
    });

    it('換舞台時聊天室跟過去，串流 item 的 i 集合不變', () => {
        focusRoomItem('w2');
        const items = useStreamStore.getState().canvasItems;
        expect(items.find(it => it.type === 'chat')!.contentId).toBe(2);
        expect(items.filter(it => it.type === 'stream').map(it => it.i).sort()).toEqual(['w1', 'w2', 'w3']);
    });
});
