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

// 第三輪審查：長版面＋自訂排法拖聊天室左緣，依比例縮放做不到時不能整頁重排
describe('長版面＋自訂排法拖聊天室左緣', () => {
    /** 超過 24 列的自訂排法：右上那路只有 6 欄，聊天室調到 6 欄會讓它窄於 6 */
    const longCustom = () => [
        win('s1', 'stream', 0, 0, 14, 20),
        win('s2', 'stream', 14, 0, 6, 20),
        win('s3', 'stream', 0, 20, 20, 10),
        win('chat', 'chat', 20, 0, 4, 24),
    ];

    it('isChatColumnResize：依比例縮放會讓串流過窄、又不是標準欄式排法 → false（走推擠）', () => {
        expect(isChatColumnResize(longCustom(), 'chat', 18, 0, 6, 24)).toBe(false);
        // 依比例縮放做得到的寬度（5 欄）照樣算欄寬調整
        expect(isChatColumnResize(longCustom(), 'chat', 19, 0, 5, 24)).toBe(true);
    });

    it('實際拖曳：不呼叫欄寬調整，走推擠；串流的高度與上下位置不被整頁重排', () => {
        const onChatColumnResize = vi.fn();
        const { handle, onWindowUpdate } = mount(longCustom(), onChatColumnResize);
        drag(handle('chat', 'w'), -CELL_W * 2, 0);
        expect(onChatColumnResize).not.toHaveBeenCalled();
        const out: CanvasWindow[] = onWindowUpdate.mock.calls.at(-1)![0];
        expect(out.find(w => w.id === 's1')).toMatchObject({ gridY: 0, gridH: 20 });
        expect(out.find(w => w.id === 's2')).toMatchObject({ gridY: 0, gridH: 20 });
        expect(out.find(w => w.id === 'chat')).toMatchObject({ gridW: 6 });
    });

    it('標準欄式排法（13 路退回成小格子）：依比例縮放做不到，但重排結果就是現況 → 仍走欄寬調整', () => {
        const aspect = 1200 / 960; // 與測試裡的視窗尺寸一致（isChatColumnResize 預設取視窗比例）
        const { streams, chats } = generateColumnLayout(13, 1, aspect, 4);
        const ws = [
            ...streams.map((r, k) => win(`s${k}`, 'stream', r.x, r.y, r.w, r.h)),
            win('chat', 'chat', chats[0].x, chats[0].y, chats[0].w, chats[0].h),
        ];
        expect(isChatColumnResize(ws, 'chat', 18, 0, 6, 24)).toBe(true);
        const onChatColumnResize = vi.fn();
        const { handle } = mount(ws, onChatColumnResize);
        drag(handle('chat', 'w'), -CELL_W * 2, 0);
        expect(onChatColumnResize).toHaveBeenCalledWith(6);
    });
});

// 第三輪審查：高度低於 6 的小格子（16 路＋寬 8 聊天室退回成 4 列高）
describe('比 6 列矮的格子縮放', () => {
    const crowdedTall = (): CanvasWindow[] => {
        const { streams, chats } = generateColumnLayout(16, 1, 1200 / 960, 8);
        return [
            ...streams.map((r, k) => win(`s${k}`, 'stream', r.x, r.y, r.w, r.h)),
            win('chat', 'chat', chats[0].x, chats[0].y, chats[0].w, chats[0].h),
        ];
    };
    const shortOne = (ws: CanvasWindow[]) => ws.find(w => w.type === 'stream' && w.gridH < 6)!;

    it('退回版面裡確實有矮於 6 列的格子（前提）', () => {
        expect(shortOne(crowdedTall())).toBeTruthy();
    });

    it('下緣輕拖（不到半格）：預覽高度維持原本列數，放開什麼都不變', () => {
        const ws = crowdedTall();
        const t = shortOne(ws);
        const { handle, node, onWindowUpdate } = mount(ws, () => {});
        const h = handle(t.id, 's');
        act(() => { fireEvent.pointerDown(h, { clientX: 500, clientY: 500, pointerId: 1 }); });
        act(() => { fireEvent.pointerMove(h, { clientX: 500, clientY: 500 + CELL_H * 0.3, pointerId: 1 }); });
        expect(parseFloat(node(t.id).style.height)).toBe(t.gridH * CELL_H);
        act(() => { fireEvent.pointerUp(h, { clientX: 500, clientY: 500 + CELL_H * 0.3, pointerId: 1 }); });
        expect(onWindowUpdate).not.toHaveBeenCalled();
    });

    it('下緣往上拖想縮得更矮：停在目前列數（舊版會反向撐成 6 列），不推任何視窗', () => {
        const ws = crowdedTall();
        const t = shortOne(ws);
        const { handle, onWindowUpdate } = mount(ws, () => {});
        drag(handle(t.id, 's'), 0, -CELL_H * 2);
        expect(onWindowUpdate).not.toHaveBeenCalled();
    });
});

// 第四輪審查：版面在比例 A 產生、拖曳當下是比例 B（使用者縮放過瀏覽器）
describe('比例改變後拖聊天室左緣', () => {
    // 測試視窗是 1200×960（比例 1.25）；版面用 16:9 產生
    const fromWide = (n: number): CanvasWindow[] => {
        const { streams, chats } = generateColumnLayout(n, 1, 16 / 9, 4);
        return [
            ...streams.map((r, k) => win(`s${k}`, 'stream', r.x, r.y, r.w, r.h)),
            win('chat', 'chat', chats[0].x, chats[0].y, chats[0].w, chats[0].h),
        ];
    };

    it('16:9 產生的 13 路標準版面（依比例縮放做不到、目前比例重排也不同）：仍走欄寬調整', () => {
        const ws = fromWide(13);
        const now = generateColumnLayout(13, 1, 1200 / 960, 4).streams;
        const was = ws.filter(w => w.type === 'stream').map(w => ({ x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH }));
        expect(was).not.toEqual(now); // 前提：兩種比例的標準版面確實不同
        const onChatColumnResize = vi.fn();
        const { handle, onWindowUpdate } = mount(ws, onChatColumnResize);
        drag(handle('chat', 'w'), -CELL_W * 2, 0);
        expect(onChatColumnResize).toHaveBeenCalledWith(6);
        expect(onWindowUpdate).not.toHaveBeenCalled();
    });

    it('自訂排法在同樣的比例下仍走推擠', () => {
        const onChatColumnResize = vi.fn();
        const { handle, onWindowUpdate } = mount([
            win('s1', 'stream', 0, 0, 14, 20),
            win('s2', 'stream', 14, 0, 6, 20),
            win('s3', 'stream', 0, 20, 20, 10),
            win('chat', 'chat', 20, 0, 4, 24),
        ], onChatColumnResize);
        drag(handle('chat', 'w'), -CELL_W * 2, 0);
        expect(onChatColumnResize).not.toHaveBeenCalled();
        expect(onWindowUpdate).toHaveBeenCalled();
    });
});
