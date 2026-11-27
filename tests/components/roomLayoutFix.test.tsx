// 房間模式版面修正：候場懸浮工具、閒置淡出、底部指令列、手動調整的版面不被同步蓋回
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n/i18n';
import { useStreamStore } from '../../src/store/useStreamStore';
import { useUIStore } from '../../src/store/useUIStore';
import { CanvasStreamContent } from '../../src/components/Pages/CanvasStreamContent';
import { DraggableWindow, type WindowRenderProps } from '../../src/components/Canvas/DraggableWindow';
import { RoomShell } from '../../src/components/Navigation/RoomShell';
import { useRoomSync } from '../../src/components/Navigation/roomSync';
import type { CanvasItem } from '../../src/types/canvas';
import type { StreamData } from '../../src/utils/streamUtils';

vi.mock('../../src/components/StreamChat', () => ({
    StreamChat: () => <div data-testid="stream-chat">Stream Chat Content</div>,
}));
vi.mock('../../src/components/Canvas/WindowParts/StreamIframe', () => ({
    StreamIframe: () => <div data-testid="stream-iframe">Stream Iframe Content</div>,
}));

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const mk = (id: number, name: string): StreamData => ({
    id, platform: 'twitch', channelId: name, videoId: '', originalUrl: '', volume: 100, chatVisible: true, isMuted: false, displayName: name,
});
const makeRenderProps = (): WindowRenderProps => ({
    dragHandlers: {
        onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn(), onPointerCancel: vi.fn(), onLostPointerCapture: vi.fn(),
    },
    isDragging: false,
    isResizing: false,
    gridW: 4,
    gridH: 6,
    onRemove: vi.fn(),
});
const tool = (container: HTMLElement, name: string) => container.querySelector<HTMLElement>(`[data-room-tool="${name}"]`);

describe('CanvasStreamContent 房間模式：懸浮工具', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        useUIStore.setState({ theaterWindowId: null, islandStyle: 'room', roomMode: 'stage' });
        useStreamStore.setState({
            streams: [mk(1, 'Alpha'), mk(2, 'Bravo'), mk(3, 'Charlie')],
            canvasItems: [
                { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 18, 24) },
                { i: 'w2', type: 'stream', contentId: 2, layout: L(18, 0, 6, 12) },
                { i: 'w3', type: 'stream', contentId: 3, layout: L(18, 12, 6, 12) },
            ],
        });
    });
    afterEach(() => useUIStore.setState({ islandStyle: 'original', roomMode: 'stage' }));

    it('R3 舞台模式的候場沒有蓋滿整格的按鈕，且有放上舞台與關閉工具', () => {
        const { container } = render(<CanvasStreamContent stream={mk(2, 'Bravo')} windowType="stream" renderProps={makeRenderProps()} windowId="w2" />);
        const covers = Array.from(container.querySelectorAll('button')).filter(b => {
            const cls = b.getAttribute('class') ?? '';
            return /(^|\s)absolute(\s|$)/.test(cls) && /(^|\s)inset-0(\s|$)/.test(cls);
        });
        expect(covers).toHaveLength(0);
        expect(tool(container, 'stage')).not.toBeNull();
        expect(tool(container, 'close')).not.toBeNull();
    });

    it.each(['grid', 'stage'] as const)('R4 %s 模式點關閉工具會呼叫 onRemove', mode => {
        useUIStore.setState({ roomMode: mode });
        const renderProps = makeRenderProps();
        const { container } = render(<CanvasStreamContent stream={mk(2, 'Bravo')} windowType="stream" renderProps={renderProps} windowId="w2" />);
        fireEvent.click(tool(container, 'close')!);
        expect(renderProps.onRemove).toHaveBeenCalledTimes(1);
    });

    it('R5 點靜音工具會讓該路 isMuted 由 false 變 true，其他路不變', () => {
        const { container } = render(<CanvasStreamContent stream={mk(2, 'Bravo')} windowType="stream" renderProps={makeRenderProps()} windowId="w2" />);
        fireEvent.click(tool(container, 'mute')!);
        const streams = useStreamStore.getState().streams;
        expect(streams.find(s => s.id === 2)!.isMuted).toBe(true);
        expect(streams.find(s => s.id === 1)!.isMuted).toBe(false);
        expect(streams.find(s => s.id === 3)!.isMuted).toBe(false);
    });

    it('R9 平分有拖曳把手與設為焦點、舞台兩者都沒有，且拖曳把手掛著 dragHandlers', () => {
        useUIStore.setState({ roomMode: 'grid' });
        const renderProps = makeRenderProps();
        const grid = render(<CanvasStreamContent stream={mk(2, 'Bravo')} windowType="stream" renderProps={renderProps} windowId="w2" />);
        const drag = tool(grid.container, 'drag');
        expect(drag).not.toBeNull();
        expect(tool(grid.container, 'focus')).not.toBeNull();
        fireEvent.pointerDown(drag!);
        expect(renderProps.dragHandlers.onPointerDown).toHaveBeenCalledTimes(1);
        grid.unmount();

        useUIStore.setState({ roomMode: 'stage' });
        const stage = render(<CanvasStreamContent stream={mk(2, 'Bravo')} windowType="stream" renderProps={makeRenderProps()} windowId="w2" />);
        expect(tool(stage.container, 'drag')).toBeNull();
        expect(tool(stage.container, 'focus')).toBeNull();
    });
});

describe('DraggableWindow 候場浮窗', () => {
    const baseProps = () => ({
        window: { id: 'w2', gridX: 18, gridY: 0, gridW: 6, gridH: 12, contentId: 2, type: 'stream' as const },
        gridConfig: { cols: 24, rows: 24, cellWidth: 50, cellHeight: 30, containerWidth: 1200, containerHeight: 720 },
        renderContent: () => <div data-testid="content" />,
        onPositionChange: vi.fn(),
        onSizeChange: vi.fn(),
        onRemove: vi.fn(),
        onSwapHover: vi.fn(),
        checkDragCollision: vi.fn(() => null),
    });
    const rect = { x: 968, y: 206, width: 220, height: 124 };

    it('R6 閒置時候場浮窗淡出但仍可被滑鼠碰到（碰到就叫醒），恢復後透明度回來', () => {
        const { container, rerender } = render(<DraggableWindow {...baseProps()} overlayRect={rect} overlayHidden />);
        const wing = container.querySelector<HTMLElement>('[data-room-wing]');
        expect(wing).not.toBeNull();
        expect(wing!.style.opacity).toBe('0');
        // 實測修正：舞台是播放器 iframe，滑鼠在上面移動網頁收不到；候場若不可碰，就再也叫不回來
        expect(wing!.style.pointerEvents).not.toBe('none');
        expect(wing!.style.width).toBe('220px');
        expect(wing!.style.height).toBe('124px');
        expect(`${wing!.style.transform}|${wing!.style.left}|${wing!.style.top}`).toMatch(/968/);
        expect(`${wing!.style.transform}|${wing!.style.left}|${wing!.style.top}`).toMatch(/206/);

        rerender(<DraggableWindow {...baseProps()} overlayRect={rect} overlayHidden={false} />);
        const shown = container.querySelector<HTMLElement>('[data-room-wing]')!;
        expect(shown.style.opacity).not.toBe('0');
        expect(shown.style.pointerEvents).not.toBe('none');
    });

    it('R6 沒給 overlayRect 時不是候場浮窗（沒有 data-room-wing）', () => {
        const { container } = render(<DraggableWindow {...baseProps()} />);
        expect(container.querySelector('[data-room-wing]')).toBeNull();
    });
});

describe('RoomShell 指令列', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        useUIStore.setState({ islandStyle: 'room', roomMode: 'stage' });
        useStreamStore.setState({
            streams: [mk(1, 'Alpha'), mk(2, 'Bravo')],
            canvasItems: [
                { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 18, 24) },
                { i: 'w2', type: 'stream', contentId: 2, layout: L(18, 0, 6, 24) },
            ],
        });
    });
    afterEach(() => useUIStore.setState({ islandStyle: 'original', roomMode: 'stage' }));

    it('R7 指令列改到底部（data-bar-position=bottom）', () => {
        const { container } = render(<RoomShell />);
        expect(container.querySelector('nav[data-tour="island"]')).toHaveAttribute('data-bar-position', 'bottom');
    });

    it('R8 點指令列的聲音鈕才出現聲音控制面板', () => {
        render(<RoomShell />);
        // 沒有面板時文字不存在；面板內的「總音量」標題是 MediaControlPanel 獨有
        const masterLabel = i18n.t('controlPanel:masterVolume');
        expect(screen.queryAllByText(masterLabel)).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('room.media', { ns: 'common' }) }));
        expect(screen.getAllByText(masterLabel).length).toBeGreaterThan(0);
    });
});

// 防回歸：此條現在可能就是綠的
describe('useRoomSync：平分模式', () => {
    it('R10 手動拉過的串流高度在重新渲染後不被同步蓋回', () => {
        const items: CanvasItem[] = [
            { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 9, 24) },
            { i: 'w2', type: 'stream', contentId: 2, layout: L(9, 0, 9, 24) },
            { i: 'c1', type: 'chat', contentId: 1, layout: L(18, 0, 6, 24), sharedChat: true },
        ];
        useUIStore.setState({ roomMode: 'grid', audioFollowsFocus: false, masterMuted: false });
        useStreamStore.setState({ canvasItems: items, streams: [mk(1, 'Alpha'), mk(2, 'Bravo')], chatColumnWidth: 6 });
        const { rerender } = renderHook(() => useRoomSync());

        act(() => { useStreamStore.getState().updateCanvasItem('w1', { layout: L(0, 0, 9, 14) }); });
        rerender();

        const w1 = useStreamStore.getState().canvasItems.find(it => it.i === 'w1')!;
        expect(w1.layout).toEqual(L(0, 0, 9, 14));
        useUIStore.setState({ roomMode: 'stage' });
    });
});
