// 縮放手感（階段 3 後半）：邊緣把手、預覽即夾限（放開不彈回）、capture 遺失會收尾、
// 右側聊天室欄拖左緣＝調整欄寬（不走推擠）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { SimpleCanvas, isChatColumnResize } from '../../src/components/Canvas/SimpleCanvas';
import type { CanvasWindow } from '../../src/components/Canvas/DraggableWindow';
import { generateColumnLayout } from '../../src/utils/layoutPresets';

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

// code review 2026-10-08：只有「串流全在左、聊天室是右側滿高一欄」才走欄寬調整，其餘走一般縮放
describe('isChatColumnResize：只認真正的右側滿高聊天室欄', () => {
    it('右側也有直播的自訂排法：拉聊天室左緣走一般縮放（不整頁重排）', () => {
        const ws = [
            win('s1', 'stream', 0, 0, 20, 12),
            win('chat', 'chat', 20, 0, 4, 12),
            win('s2', 'stream', 0, 12, 24, 12), // 直播延伸到聊天室底下、右緣
        ];
        expect(isChatColumnResize(ws, 'chat', 18, 0, 6, 12)).toBe(false);
    });

    it('貼右緣的半高聊天室：走一般縮放', () => {
        const ws = [
            win('s1', 'stream', 0, 0, 20, 24),
            win('chat', 'chat', 20, 0, 4, 12),
            win('s2', 'stream', 20, 12, 4, 12),
        ];
        expect(isChatColumnResize(ws, 'chat', 18, 0, 6, 12)).toBe(false);
    });

    it('多個聊天室上下接滿整欄（每路一聊重排後的樣子）：仍算欄寬調整', () => {
        const ws = [
            win('s1', 'stream', 0, 0, 20, 12),
            win('s2', 'stream', 0, 12, 20, 12),
            win('c1', 'chat', 20, 0, 4, 12),
            win('c2', 'chat', 20, 12, 4, 12),
        ];
        expect(isChatColumnResize(ws, 'c1', 18, 0, 6, 12)).toBe(true);
    });

    it('同一欄但中間有縫：不算滿高', () => {
        const ws = [
            win('s1', 'stream', 0, 0, 20, 24),
            win('c1', 'chat', 20, 0, 4, 8),
            win('c2', 'chat', 20, 16, 4, 8),
        ];
        expect(isChatColumnResize(ws, 'c1', 18, 0, 6, 8)).toBe(false);
    });

    it('實際拖曳：右側有直播時拉聊天室左緣不呼叫欄寬調整，改走推擠落地', () => {
        const onChatColumnResize = vi.fn();
        const { handle, onWindowUpdate } = mount([
            win('s1', 'stream', 0, 0, 20, 12),
            win('chat', 'chat', 20, 0, 4, 12),
            win('s2', 'stream', 0, 12, 24, 12),
        ], onChatColumnResize);
        drag(handle('chat', 'w'), -CELL_W * 2, 0);
        expect(onChatColumnResize).not.toHaveBeenCalled();
        expect(onWindowUpdate).toHaveBeenCalled();
    });
});

describe('比上限寬的聊天室：預覽與落地同一個上限（不彈回）', () => {
    const wide = () => [
        win('s1', 'stream', 0, 0, 14, 24),
        win('chat', 'chat', 14, 0, 10, 24),
    ];

    it('寬 10 縮到 9：超出欄寬範圍，走推擠、落地就是預覽的 9 欄', () => {
        const onChatColumnResize = vi.fn();
        const { handle, onWindowUpdate } = mount(wide(), onChatColumnResize);
        drag(handle('chat', 'w'), CELL_W, 0);
        expect(onChatColumnResize).not.toHaveBeenCalled();
        const chat = onWindowUpdate.mock.calls.at(-1)![0].find((w: CanvasWindow) => w.id === 'chat');
        expect(chat).toMatchObject({ gridX: 15, gridW: 9 });
    });

    it('寬 10 縮到 8 以內：落入欄寬範圍，交給欄寬調整（setChatColumnWidth 不會再夾）', () => {
        const onChatColumnResize = vi.fn();
        const { handle } = mount(wide(), onChatColumnResize);
        drag(handle('chat', 'w'), CELL_W * 3, 0);
        expect(onChatColumnResize).toHaveBeenCalledWith(7);
    });

    it('isChatColumnResize：新寬度超出 3～8 一律 false', () => {
        expect(isChatColumnResize(wide(), 'chat', 15, 0, 9, 24)).toBe(false);
        expect(isChatColumnResize(wide(), 'chat', 16, 0, 8, 24)).toBe(true);
    });
});

describe('縮放把手只佔視窗外框', () => {
    it('四條邊的把手都是 4px（h-1／w-1），不再是 6px 蓋住聊天室捲軸與播放器下緣', () => {
        const { handle } = mount(layout());
        for (const d of ['n', 's']) expect(handle('s1', d).className.split(/\s+/)).toContain('h-1');
        for (const d of ['w', 'e']) expect(handle('s1', d).className.split(/\s+/)).toContain('w-1');
        for (const d of ['n', 's', 'w', 'e']) expect(handle('s1', d).className).not.toMatch(/(^|\s)[hw]-1\.5(\s|$)/);
    });
});

// 第二輪審查：退回策略排出的小格子（例如 13 路＋聊天室欄的 5×6）輕拖不能被撐成 6×6、推動整張畫布
describe('比 6×6 小的格子縮放', () => {
    const crowded = (): CanvasWindow[] => {
        const { streams, chats } = generateColumnLayout(13, 1, 16 / 9, 4);
        return [
            ...streams.map((r, k) => win(`s${k}`, 'stream', r.x, r.y, r.w, r.h)),
            win('chat', 'chat', chats[0].x, chats[0].y, chats[0].w, chats[0].h),
        ];
    };

    it('右緣輕拖（不到半格）：預覽寬度維持 5 格，放開什麼都不變', () => {
        const { handle, node, onWindowUpdate } = mount(crowded(), () => {});
        const h = handle('s0', 'e');
        act(() => { fireEvent.pointerDown(h, { clientX: 500, clientY: 500, pointerId: 1 }); });
        act(() => { fireEvent.pointerMove(h, { clientX: 500 + CELL_W * 0.3, clientY: 500, pointerId: 1 }); });
        expect(parseFloat(node('s0').style.width)).toBe(5 * CELL_W);
        act(() => { fireEvent.pointerUp(h, { clientX: 500 + CELL_W * 0.3, clientY: 500, pointerId: 1 }); });
        expect(onWindowUpdate).not.toHaveBeenCalled();
    });

    it('右緣往內拖想縮得更小：停在目前 5 格（下限＝自身，舊版會反向撐成 6 格），不推任何視窗', () => {
        const { handle, onWindowUpdate } = mount(crowded(), () => {});
        drag(handle('s0', 'e'), -CELL_W * 2, 0);
        expect(onWindowUpdate).not.toHaveBeenCalled();
    });
});

describe('isChatColumnResize：畫布往下長之後', () => {
    it('串流排到 30 列、聊天室欄 0～24 列：仍算欄寬調整', () => {
        const ws = [
            win('s1', 'stream', 0, 0, 20, 15),
            win('s2', 'stream', 0, 15, 20, 15),
            win('chat', 'chat', 20, 0, 4, 24),
        ];
        expect(isChatColumnResize(ws, 'chat', 18, 0, 6, 24)).toBe(true);
    });

    it('5 個聊天室各 6 列接到 30 列：仍算欄寬調整', () => {
        const ws = [
            win('s1', 'stream', 0, 0, 20, 30),
            ...[0, 1, 2, 3, 4].map(k => win(`c${k}`, 'chat', 20, k * 6, 4, 6)),
        ];
        expect(isChatColumnResize(ws, 'c0', 18, 0, 6, 6)).toBe(true);
    });

    it('聊天室欄不滿一個畫面高（0～18 列）：不算', () => {
        const ws = [
            win('s1', 'stream', 0, 0, 20, 30),
            win('chat', 'chat', 20, 0, 4, 18),
        ];
        expect(isChatColumnResize(ws, 'chat', 18, 0, 6, 18)).toBe(false);
    });
});
