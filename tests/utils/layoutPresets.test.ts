import { describe, it, expect } from 'vitest';
import {
    fitTiles,
    generateSharedChatLayout,
    generateLayoutFromTemplate,
    layoutTemplates,
} from '../../src/utils/layoutPresets';

type Spec = { type: 'stream' | 'chat'; x: number; y: number; w: number; h: number; contentId: unknown };

const ASPECTS: Record<string, number> = {
    '16:9': 16 / 9,
    '1920x969（實際瀏覽器內框）': 1920 / 969,
    '16:10': 16 / 10,
    '21:9': 21 / 9,
    '4:3': 4 / 3,
};

function expectSaneLayout(specs: Spec[]) {
    for (const s of specs) {
        for (const k of ['x', 'y', 'w', 'h'] as const) expect(Number.isInteger(s[k])).toBe(true);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(24);
        if (s.type === 'stream') {
            expect(s.w).toBeGreaterThanOrEqual(6);
            expect(s.h).toBeGreaterThanOrEqual(6);
        }
    }
    // 互不重疊
    for (let i = 0; i < specs.length; i++) {
        for (let j = i + 1; j < specs.length; j++) {
            const a = specs[i], b = specs[j];
            const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            expect(overlap, `${JSON.stringify(a)} 與 ${JSON.stringify(b)} 重疊`).toBe(false);
        }
    }
}

describe('fitTiles', () => {
    it('16:9 畫布上 2×2 tile 剛好填滿 24×24，每格 12×12', () => {
        const rects = fitTiles(
            [{ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 }, { x: 0, y: 1, w: 1, h: 1 }, { x: 1, y: 1, w: 1, h: 1 }],
            16 / 9,
        );
        expect(rects).toEqual([
            { x: 0, y: 0, w: 12, h: 12 }, { x: 12, y: 0, w: 12, h: 12 },
            { x: 0, y: 12, w: 12, h: 12 }, { x: 12, y: 12, w: 12, h: 12 },
        ]);
    });

    it('上下不留空：高度一律填滿（2 路並排在 16:9 上是兩個 12×24）', () => {
        const rects = fitTiles([{ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 }], 16 / 9);
        expect(rects).toEqual([{ x: 0, y: 0, w: 12, h: 24 }, { x: 12, y: 0, w: 12, h: 24 }]);
    });

    it('左右也不留空：21:9 上 1 格撐滿 24×24（使用者裁定「不留空」，寧可播放器內有黑邊）', () => {
        expect(fitTiles([{ x: 0, y: 0, w: 1, h: 1 }], 21 / 9)).toEqual([{ x: 0, y: 0, w: 24, h: 24 }]);
    });

    it('除不盡時以邊界取整：3 欄塞進 20 欄無縫、無重疊', () => {
        const rects = fitTiles([0, 1, 2].map(x => ({ x, y: 0, w: 1, h: 1 })), 16 / 9, { x0: 0, cols: 20, rows: 24 });
        expect(rects[0].x).toBe(0);
        for (let i = 1; i < 3; i++) expect(rects[i].x).toBe(rects[i - 1].x + rects[i - 1].w);
        expect(rects[2].x + rects[2].w).toBe(20);
    });

    it('area 參數：只在指定欄範圍內擬合', () => {
        const rects = fitTiles([{ x: 0, y: 0, w: 1, h: 1 }], 16 / 9, { x0: 0, cols: 20, rows: 24 });
        expect(rects[0].x + rects[0].w).toBeLessThanOrEqual(20);
    });
});

describe('純串流版型（填滿畫布）', () => {
    const ids = [1, 2, 3, 4, 5, 6];

    for (const [label, aspect] of Object.entries(ASPECTS)) {
        for (const n of [2, 3, 4, 5, 6]) {
            it(`template-${n}-landscape @ ${label}：整數、界內、不重疊、填滿整個畫布`, () => {
                const specs = generateLayoutFromTemplate(`template-${n}-landscape`, ids.slice(0, n), aspect) as Spec[];
                expect(specs).toHaveLength(n);
                expectSaneLayout(specs);
                specs.forEach((s, i) => expect(s.contentId).toBe(ids[i]));
                // 上下左右都不留空：總面積剛好 24×24（已驗證不重疊，所以面積相等＝填滿）
                expect(specs.reduce((a, s) => a + s.w * s.h, 0)).toBe(24 * 24);
            });
        }
    }

    it('回歸：16:9 下 4 路仍是 4 個 12×12', () => {
        const specs = generateLayoutFromTemplate('template-4-landscape', [1, 2, 3, 4], 16 / 9) as Spec[];
        expect(specs.map(s => [s.x, s.y, s.w, s.h])).toEqual([[0, 0, 12, 12], [12, 0, 12, 12], [0, 12, 12, 12], [12, 12, 12, 12]]);
    });

    it('3 路維持「主畫面 + 右側 2 小」的結構', () => {
        const [main, a, b] = generateLayoutFromTemplate('template-3-landscape', [1, 2, 3], 16 / 9) as Spec[];
        expect(main.w).toBe(a.w * 2);
        expect(main.h).toBe(a.h + b.h);
        expect(a.x).toBe(main.x + main.w);
    });

    it('未提供 aspect 時預設 16:9（相容舊呼叫者）', () => {
        expect(generateLayoutFromTemplate('template-4-landscape', [1, 2, 3, 4]))
            .toEqual(generateLayoutFromTemplate('template-4-landscape', [1, 2, 3, 4], 16 / 9));
    });
});

describe('N 串 + 1 共用聊天室', () => {
    for (const [label, aspect] of Object.entries(ASPECTS)) {
        for (const n of [1, 2, 3, 4, 5, 6, 9]) {
            it(`${n} 路 @ ${label}：恰好 1 個滿高聊天室在串流右側、串流不重疊`, () => {
                const ids = Array.from({ length: n }, (_, i) => i + 1);
                const specs = generateSharedChatLayout(ids, aspect, ids[0]) as Spec[];
                const chats = specs.filter(s => s.type === 'chat');
                const streams = specs.filter(s => s.type === 'stream');
                expect(chats).toHaveLength(1);
                expect(streams).toHaveLength(n);
                expect(chats[0]).toMatchObject({ w: 4, y: 0, h: 24, contentId: 1 });
                expectSaneLayout(specs);
                const streamRight = Math.max(...streams.map(s => s.x + s.w));
                expect(chats[0].x).toBeGreaterThanOrEqual(streamRight);
                streams.forEach((s, i) => expect(s.contentId).toBe(ids[i]));
                // 串流區（左側 20 欄）上下左右都不留空；n 很大時列高被夾到 6、畫布往下長
                if (Math.ceil(n / 3) * 6 <= 24) {
                    expect(chats[0].x).toBe(20);
                    expect(streams.reduce((a, s) => a + s.w * s.h, 0)).toBe(20 * 24);
                }
            });
        }
    }

    it('16:9 下 4 路是田字 2×2', () => {
        const streams = (generateSharedChatLayout([1, 2, 3, 4], 16 / 9, 1) as Spec[]).filter(s => s.type === 'stream');
        const xs = new Set(streams.map(s => s.x)), ys = new Set(streams.map(s => s.y));
        expect(xs.size).toBe(2);
        expect(ys.size).toBe(2);
    });

    it('3 路時最後一列那一格撐滿整列（不留空）', () => {
        const streams = (generateSharedChatLayout([1, 2, 3], 16 / 9, 1) as Spec[]).filter(s => s.type === 'stream');
        const [a, b, c] = streams;
        expect(a.y).toBe(b.y);
        expect(c.y).toBe(a.y + a.h);
        expect(c.x).toBe(a.x);
        expect(c.w).toBe(a.w + b.w);
    });

    it('2 路在一般螢幕上下疊、各撐滿寬度（每路畫面比左右並排大）', () => {
        const streams = (generateSharedChatLayout([1, 2], 1800 / 1087, 1) as Spec[]).filter(s => s.type === 'stream');
        expect(streams.map(s => [s.x, s.y, s.w, s.h])).toEqual([[0, 0, 20, 12], [0, 12, 20, 12]]);
    });

    it('聊天室顯示的那一路由第三個參數決定，空槽時為 null', () => {
        expect((generateSharedChatLayout([7, 8], 16 / 9, 8) as Spec[]).find(s => s.type === 'chat')!.contentId).toBe(8);
        expect((generateSharedChatLayout([null, null], 16 / 9, null) as Spec[]).find(s => s.type === 'chat')!.contentId).toBeNull();
    });

    it('註冊了 2、3、4 路的共用聊天室版型', () => {
        const shared = layoutTemplates.filter(t => t.type === 'shared_chat').map(t => t.count);
        expect(shared).toEqual([2, 3, 4]);
    });
});
