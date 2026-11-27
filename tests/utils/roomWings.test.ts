// 房間模式舞台：焦點滿版（R1）與候場浮窗位置（R2）
import { describe, it, expect } from 'vitest';
import { stageLayout, wingRects } from '../../src/utils/roomStage';
import type { CanvasItem } from '../../src/types/canvas';

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const S = (i: string, contentId: number | null): CanvasItem => ({ i, type: 'stream', contentId, layout: L(0, 0, 6, 6) });
const C = (i: string, contentId: number | null): CanvasItem => ({ i, type: 'chat', contentId, layout: L(18, 0, 6, 24) });

describe('stageLayout：焦點滿版', () => {
    it('R1 4 路串流加聊天室、聊天室 6 欄時，焦點佔滿串流區 (0,0,18,24)', () => {
        const items = [S('a', 1), S('b', 2), S('c', 3), S('d', 4), C('chat', 1)];
        const out = stageLayout(items, 'b', 6);
        expect(out).not.toBeNull();
        expect(out!.find(it => it.i === 'b')!.layout).toEqual(L(0, 0, 18, 24));
    });
});

describe('wingRects：候場浮窗位置', () => {
    const stage = { x: 0, y: 0, width: 1200, height: 800 };

    it('R2 3 路候場浮在右緣垂直置中，每格 220×124，x=968，y 依序 206／338／470', () => {
        const rects = wingRects(3, stage);
        expect(rects).toEqual([
            { x: 968, y: 206, width: 220, height: 124 },
            { x: 968, y: 338, width: 220, height: 124 },
            { x: 968, y: 470, width: 220, height: 124 },
        ]);
    });

    it('R2 只有 1 路候場時單格垂直置中（y=338）', () => {
        expect(wingRects(1, stage)).toEqual([{ x: 968, y: 338, width: 220, height: 124 }]);
    });

    it('R2 舞台有偏移時位置跟著偏移（x=100+1000-12-220，y 置中後加 50）', () => {
        const rects = wingRects(2, { x: 100, y: 50, width: 1000, height: 600 });
        expect(rects).toEqual([
            { x: 868, y: 222, width: 220, height: 124 },
            { x: 868, y: 354, width: 220, height: 124 },
        ]);
    });
});
