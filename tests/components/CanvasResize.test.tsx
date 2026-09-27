// 縮放手感（階段 3 後半）：邊緣把手、預覽即夾限（放開不彈回）、capture 遺失會收尾、
// 右側聊天室欄拖左緣＝調整欄寬（不走推擠）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { SimpleCanvas, isChatColumnResize } from '../../src/components/Canvas/SimpleCanvas';
import type { CanvasWindow } from '../../src/components/Canvas/DraggableWindow';

// jsdom 沒有 PointerEvent（fireEvent 會退回 Event，clientX 就不見了）與 pointer capture
class FakePointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
    }
}

const CELL_W = 1200 / 24;
const CELL_H = 960 / 24;

beforeEach(() => {
    vi.stubGlobal('PointerEvent', FakePointerEvent);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 960 });
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    // RAF 同步執行：pointermove 的幾何計算立刻生效
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { cb(0); return 1; });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const win = (id: string, type: CanvasWindow['type'], gridX: number, gridY: number, gridW: number, gridH: number): CanvasWindow =>
    ({ id, type, gridX, gridY, gridW, gridH, contentId: 1 });

const layout = () => [
    win('s1', 'stream', 0, 0, 20, 12),
    win('s2', 'stream', 0, 12, 20, 12),
    win('chat', 'chat', 20, 0, 4, 24),
];

function mount(windows: CanvasWindow[], onChatColumnResize?: (cols: number) => void) {
    const onWindowUpdate = vi.fn();
    const utils = render(
        <SimpleCanvas
            windows={windows}
            onWindowUpdate={onWindowUpdate}
            onWindowRemove={() => {}}
            renderContent={w => <div data-win={w.id} />}
            onChatColumnResize={onChatColumnResize}
        />,
    );
    const handle = (id: string, dir: string) =>
        utils.container.querySelector(`[data-canvas-window-id="${id}"] [data-edge="${dir}"], [data-canvas-window-id="${id}"] [data-corner="${dir}"]`)!;
    const node = (id: string) => utils.container.querySelector(`[data-canvas-window-id="${id}"]`) as HTMLElement;
    return { ...utils, onWindowUpdate, handle, node };
}

const drag = (el: Element, dx: number, dy: number, end: 'up' | 'lost' = 'up') => {
    act(() => { fireEvent.pointerDown(el, { clientX: 500, clientY: 500, pointerId: 1 }); });
    act(() => { fireEvent.pointerMove(el, { clientX: 500 + dx, clientY: 500 + dy, pointerId: 1 }); });
    act(() => {
        if (end === 'up') fireEvent.pointerUp(el, { clientX: 500 + dx, clientY: 500 + dy, pointerId: 1 });
        else fireEvent(el, new Event('lostpointercapture', { bubbles: true }));
    });
};

describe('視窗縮放', () => {
    it('四角之外還有四條邊的把手', () => {
        const { handle } = mount(layout());
        for (const d of ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']) expect(handle('s1', d)).toBeTruthy();
    });

    it('拖下緣只改高度，寬度與位置不動', () => {
        const { handle, onWindowUpdate } = mount(layout());
        drag(handle('s1', 's'), 300, CELL_H * 3);
        const s1 = onWindowUpdate.mock.calls.at(-1)![0].find((w: CanvasWindow) => w.id === 's1');
        expect(s1).toMatchObject({ gridX: 0, gridY: 0, gridW: 20, gridH: 15 });
    });

    it('預覽時就夾在最小尺寸：串流縮不到 6 格以下，放開不會彈回', () => {
        const { handle, node } = mount(layout());
        const h = handle('s1', 'e');
        act(() => { fireEvent.pointerDown(h, { clientX: 500, clientY: 500, pointerId: 1 }); });
        act(() => { fireEvent.pointerMove(h, { clientX: 500 - CELL_W * 18, clientY: 500, pointerId: 1 }); });
        // 跟手預覽的寬度就是 6 格（舊版會先縮到 4 格、放開才跳回 6 格）
        expect(parseFloat(node('s1').style.width)).toBe(6 * CELL_W);
        act(() => { fireEvent.pointerUp(h, { clientX: 500 - CELL_W * 18, clientY: 500, pointerId: 1 }); });
    });

    it('在 iframe 上放開（pointer capture 遺失）也會收尾落地，不會卡在縮放狀態', () => {
        const { handle, onWindowUpdate, container } = mount(layout());
        drag(handle('s1', 's'), 0, CELL_H * 2, 'lost');
        expect(onWindowUpdate).toHaveBeenCalled();
        // 縮放中才出現的尺寸指示器已消失
        expect(container.textContent).not.toMatch(/\d+ × \d+/);
    });
});

describe('右側聊天室欄：拖左緣調整欄寬', () => {
    it('拖左緣：回報新欄寬給上層重排，不走推擠', () => {
        const onChatColumnResize = vi.fn();
        const { handle, onWindowUpdate } = mount(layout(), onChatColumnResize);
        drag(handle('chat', 'w'), -CELL_W * 2, 0);
        expect(onChatColumnResize).toHaveBeenCalledWith(6);
        expect(onWindowUpdate).not.toHaveBeenCalled();
    });

    it('預覽寬度上限 8 格（與欄寬上限一致）', () => {
        const onChatColumnResize = vi.fn();
        const { handle } = mount(layout(), onChatColumnResize);
        drag(handle('chat', 'w'), -CELL_W * 10, 0);
        expect(onChatColumnResize).toHaveBeenCalledWith(8);
    });

    it('聊天室沒貼齊右緣（例如被拖到中間）時照舊走推擠', () => {
        const onChatColumnResize = vi.fn();
        const { handle, onWindowUpdate } = mount([
            win('s1', 'stream', 0, 0, 10, 24),
            win('chat', 'chat', 10, 0, 4, 24),
            win('s2', 'stream', 14, 0, 10, 24),
        ], onChatColumnResize);
        drag(handle('chat', 'e'), CELL_W, 0);
        expect(onChatColumnResize).not.toHaveBeenCalled();
        expect(onWindowUpdate).toHaveBeenCalled();
    });

    it('isChatColumnResize：只認「右緣不動、上下不變、所有聊天室同一欄」', () => {
        const ws = layout();
        expect(isChatColumnResize(ws, 'chat', 18, 0, 6, 24)).toBe(true);
        expect(isChatColumnResize(ws, 'chat', 20, 0, 4, 24)).toBe(false); // 寬度沒變
        expect(isChatColumnResize(ws, 'chat', 18, 0, 6, 20)).toBe(false); // 高度也變了
        expect(isChatColumnResize(ws, 's1', 0, 0, 18, 12)).toBe(false); // 不是聊天室
        const twoCols = [...ws, win('chat2', 'chat', 16, 0, 4, 12)];
        expect(isChatColumnResize(twoCols, 'chat', 18, 0, 6, 24)).toBe(false); // 聊天室不在同一欄
    });
});
