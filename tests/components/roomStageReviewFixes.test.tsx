// 房間舞台模式 review 第 1 輪：只有舞台形狀才浮候場、離開房間模式與存版面不留重疊、舞台模式所有拖曳入口都關掉
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { roomOverlayRects } from '../../src/components/Canvas/SimpleCanvas';
import { DraggableWindow, NO_DRAG_HANDLERS, type CanvasWindow, type WindowRenderProps } from '../../src/components/Canvas/DraggableWindow';
import { calculateGridConfig } from '../../src/components/Canvas/gridConfig';
import { useStreamStore } from '../../src/store/useStreamStore';
import { useUIStore } from '../../src/store/useUIStore';
import { leaveRoomLayout } from '../../src/components/Navigation/roomActions';
import type { CanvasItem } from '../../src/types/canvas';

const W = (id: string, gridX: number, gridY: number, gridW: number, gridH: number, type: 'stream' | 'chat' = 'stream'): CanvasWindow =>
    ({ id, gridX, gridY, gridW, gridH, type, contentId: 1 });
const item = (i: string, type: 'stream' | 'chat', contentId: number, x: number, y: number, w: number, h: number): CanvasItem =>
    ({ i, type, contentId, layout: { x, y, w, h } }) as CanvasItem;
const overlaps = (items: CanvasItem[]) => items.some((a, k) => items.slice(k + 1).some(b =>
    a.layout.w > 0 && b.layout.w > 0 && a.layout.x < b.layout.x + b.layout.w && b.layout.x < a.layout.x + a.layout.w
    && a.layout.y < b.layout.y + b.layout.h && b.layout.y < a.layout.y + a.layout.h));

describe('只有舞台形狀才浮候場', () => {
    it('舞台佔滿串流區時候場浮起', () => {
        const map = roomOverlayRects([W('s', 0, 0, 20, 24), W('w', 14, 0, 6, 24), W('c', 20, 0, 4, 24, 'chat')], 50, 30);
        expect(map?.has('w')).toBe(true);
    });

    it('Alt+數字套成平分形狀時不浮（避免右半邊空白、候場疊在左格）', () => {
        const map = roomOverlayRects([W('a', 0, 0, 10, 24), W('b', 10, 0, 10, 24), W('c', 20, 0, 4, 24, 'chat')], 50, 30);
        expect(map).toBeNull();
    });
});

describe('離開房間模式與存版面不留重疊', () => {
    const stageItems = () => [
        item('s', 'stream', 1, 0, 0, 20, 24), item('w', 'stream', 2, 14, 0, 6, 24), item('c', 'chat', 1, 20, 0, 4, 24),
    ];
    beforeEach(() => {
        useUIStore.setState({ islandStyle: 'room', roomMode: 'stage' });
        useStreamStore.setState({ canvasItems: stageItems(), chatColumnWidth: 4, customLayouts: [] });
    });

    it('舞台模式離開房間模式時重排成不重疊', () => {
        leaveRoomLayout();
        expect(overlaps(useStreamStore.getState().canvasItems)).toBe(false);
    });

    it('平分模式離開房間模式時版面不動', () => {
        useUIStore.setState({ roomMode: 'grid' });
        const grid = [item('a', 'stream', 1, 0, 0, 10, 24), item('b', 'stream', 2, 10, 0, 10, 24), item('c', 'chat', 1, 20, 0, 4, 24)];
        useStreamStore.setState({ canvasItems: grid });
        leaveRoomLayout();
        expect(useStreamStore.getState().canvasItems).toBe(grid);
    });

    it('舞台模式下存目前版面（另一個存檔入口），存下的格子不重疊', () => {
        useStreamStore.setState({ presets: [] });
        useStreamStore.getState().saveCurrentLayout('舞台預設');
        const saved = useStreamStore.getState().presets.find(p => p.name === '舞台預設')!;
        expect(overlaps(saved.items as CanvasItem[])).toBe(false);
    });

    it('舞台模式下存自訂版面，存下的格子不重疊', async () => {
        await useStreamStore.getState().saveCustomLayout('舞台存檔');
        const slots = useStreamStore.getState().customLayouts[0].slots as { x: number; y: number; w: number; h: number }[];
        const asItems = slots.map((s, k) => item(String(k), 'stream', k, s.x, s.y, s.w, s.h));
        expect(overlaps(asItems)).toBe(false);
    });
});

describe('舞台模式所有拖曳入口都關掉', () => {
    const cfg = calculateGridConfig(1200, 720, 24);
    const noop = () => {};
    const mount = (props: { overlayRect?: { x: number; y: number; width: number; height: number } | null; resizable?: boolean }) => {
        let got: WindowRenderProps | null = null;
        render(
            <DraggableWindow
                window={W('x', 0, 0, 6, 6)}
                gridConfig={cfg}
                renderContent={(_w, rp) => { got = rp; return null; }}
                onPositionChange={noop}
                onSizeChange={noop}
                onRemove={noop}
                onSwapHover={noop}
                checkDragCollision={() => null}
                {...props}
            />,
        );
        return got!;
    };

    it('候場浮窗給內容的拖曳 handler 是無作用版本（空槽的拖曳膠囊也拖不動）', () => {
        expect(mount({ overlayRect: { x: 1, y: 2, width: 220, height: 124 } }).dragHandlers).toBe(NO_DRAG_HANDLERS);
    });

    it('舞台模式（不可縮放）時舞台那格也拖不動', () => {
        expect(mount({ resizable: false }).dragHandlers).toBe(NO_DRAG_HANDLERS);
    });

    it('平分模式照常可拖', () => {
        expect(mount({}).dragHandlers).not.toBe(NO_DRAG_HANDLERS);
    });
});

describe('閒置判定與懸浮工具', () => {
    it('滑鼠或鍵盤焦點停在候場上時不算閒置', async () => {
        const { roomEngaged } = await import('../../src/components/Navigation/RoomShell');
        const doc = { querySelector: (sel: string) => (sel.includes(':hover') ? ({} as Element) : null) } as unknown as Document;
        expect(roomEngaged(doc)).toBe(true);
        const focusDoc = { querySelector: (sel: string) => (sel.includes(':focus-visible') ? ({} as Element) : null) } as unknown as Document;
        expect(roomEngaged(focusDoc)).toBe(true);
        expect(roomEngaged({ querySelector: () => null } as unknown as Document)).toBe(false);
    });

    it('閒置時左上懸浮工具也淡出（滑鼠停在舞台上也一樣），只有鍵盤焦點才留著', async () => {
        const { CanvasStreamContent } = await import('../../src/components/Pages/CanvasStreamContent');
        useUIStore.setState({ islandStyle: 'room', roomMode: 'stage', roomIdle: true, theaterWindowId: null });
        useStreamStore.setState({
            streams: [{ id: 1, platform: 'twitch', channelId: 'a', videoId: '', originalUrl: '', volume: 100, chatVisible: true, isMuted: false, displayName: 'A' }],
            canvasItems: [item('w1', 'stream', 1, 0, 0, 24, 24)],
        });
        const rp = { dragHandlers: NO_DRAG_HANDLERS, isDragging: false, isResizing: false, gridW: 24, gridH: 24, onRemove: () => {} } as WindowRenderProps;
        const { container } = render(<CanvasStreamContent stream={useStreamStore.getState().streams[0]} windowType="stream" renderProps={rp} windowId="w1" />);
        const tools = container.querySelector('[data-room-tools]')!;
        expect(tools.className).not.toContain('group-hover:opacity-100');
        expect(tools.className).not.toContain('focus-within:opacity-100');
        useUIStore.setState({ roomIdle: false, islandStyle: 'original' });
    });
});
