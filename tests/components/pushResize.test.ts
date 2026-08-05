import { describe, it, expect } from 'vitest';
import { resolvePushResize, resolveChainFill, findEmptyRects, type PushableWindow } from '../../src/components/Canvas/pushResize';

const GRID_COLS = 24;

interface W extends PushableWindow {
    type: 'stream' | 'chat';
}

const win = (id: string, x: number, y: number, w: number, h: number, type: 'stream' | 'chat' = 'stream'): W =>
    ({ id, gridX: x, gridY: y, gridW: w, gridH: h, type });

// 對齊 SimpleCanvas 的 SIZE_LIMITS：stream 最小 6×6;chat 寬 3~4、高最小 6
const minSize = (w: W) => (w.type === 'chat' ? { minW: 3, minH: 6, maxW: 4 } : { minW: 6, minH: 6 });

const push = (windows: W[], id: string, desired: { x: number; y: number; w: number; h: number }, maxRows?: number) =>
    resolvePushResize(windows, id, desired, { gridCols: GRID_COLS, minSize, maxRows });

const rect = (windows: W[], id: string) => {
    const w = windows.find(x => x.id === id)!;
    return { x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH };
};

/** 不變式：任兩視窗不得重疊 */
const expectNoOverlap = (windows: W[]) => {
    for (let i = 0; i < windows.length; i++) {
        for (let j = i + 1; j < windows.length; j++) {
            const a = windows[i];
            const b = windows[j];
            const overlaps =
                a.gridX < b.gridX + b.gridW &&
                a.gridX + a.gridW > b.gridX &&
                a.gridY < b.gridY + b.gridH &&
                a.gridY + a.gridH > b.gridY;
            expect(overlaps, `${a.id} 與 ${b.id} 重疊`).toBe(false);
        }
    }
};

/** 不變式：留在畫布內、不小於最小尺寸 */
const expectWithinBounds = (windows: W[]) => {
    for (const w of windows) {
        expect(w.gridX, `${w.id}.x`).toBeGreaterThanOrEqual(0);
        expect(w.gridY, `${w.id}.y`).toBeGreaterThanOrEqual(0);
        expect(w.gridX + w.gridW, `${w.id} 右緣超出畫布`).toBeLessThanOrEqual(GRID_COLS);
        expect(w.gridW, `${w.id}.w 低於最小值`).toBeGreaterThanOrEqual(minSize(w).minW);
        expect(w.gridH, `${w.id}.h 低於最小值`).toBeGreaterThanOrEqual(minSize(w).minH);
    }
};

describe('resolvePushResize', () => {
    describe('往右擴張', () => {
        it('滿版 2×2 拉大左上角：右鄰讓位，總寬維持 24', () => {
            const windows = [
                win('A', 0, 0, 12, 12),
                win('B', 12, 0, 12, 12),
                win('C', 0, 12, 12, 12),
                win('D', 12, 12, 12, 12),
            ];

            const { windows: next, applied } = push(windows, 'A', { x: 0, y: 0, w: 18, h: 12 });

            expect(applied).toEqual({ x: 0, y: 0, w: 18, h: 12 });
            expect(rect(next, 'B')).toEqual({ x: 18, y: 0, w: 6, h: 12 });
            // 不同排的視窗不該被波及
            expect(rect(next, 'C')).toEqual({ x: 0, y: 12, w: 12, h: 12 });
            expect(rect(next, 'D')).toEqual({ x: 12, y: 12, w: 12, h: 12 });
            expectNoOverlap(next);
            expectWithinBounds(next);
        });

        it('三連格：近鄰壓到最小後才輪到下一個讓位', () => {
            const windows = [
                win('A', 0, 0, 8, 24),
                win('B', 8, 0, 8, 24),
                win('C', 16, 0, 8, 24),
            ];

            // 想拉到 20 寬，但 B、C 各自只讓得出 2 格
            const { windows: next, applied } = push(windows, 'A', { x: 0, y: 0, w: 20, h: 24 });

            expect(applied.w).toBe(12); // 8 + (2 + 2)，被夾住
            expect(rect(next, 'B')).toEqual({ x: 12, y: 0, w: 6, h: 24 });
            expect(rect(next, 'C')).toEqual({ x: 18, y: 0, w: 6, h: 24 });
            expectNoOverlap(next);
            expectWithinBounds(next);
        });

        it('右側是空白時直接長大，不動任何人', () => {
            const windows = [win('A', 0, 0, 8, 24), win('B', 16, 0, 8, 24)];

            const { windows: next, applied } = push(windows, 'A', { x: 0, y: 0, w: 16, h: 24 });

            expect(applied.w).toBe(16);
            expect(rect(next, 'B')).toEqual({ x: 16, y: 0, w: 8, h: 24 }); // 空白被吃掉，B 原地不動
            expectNoOverlap(next);
            expectWithinBounds(next);
        });

        it('鄰居全部壓到最小仍不夠時，擴張量被夾住而非失敗', () => {
            const windows = [
                win('A', 0, 0, 6, 24),
                win('B', 6, 0, 6, 24),
                win('C', 12, 0, 6, 24),
                win('D', 18, 0, 6, 24),
            ];

            // 鄰居已經全部是最小寬度，讓不出任何空間
            const { windows: next, applied } = push(windows, 'A', { x: 0, y: 0, w: 24, h: 24 });

            expect(applied.w).toBe(6); // 完全推不動，維持原狀
            expectNoOverlap(next);
            expectWithinBounds(next);
        });
    });

    describe('往左擴張', () => {
        it('左鄰讓位，右緣維持不動', () => {
            const windows = [win('A', 0, 0, 12, 24), win('B', 12, 0, 12, 24)];

            const { windows: next, applied } = push(windows, 'B', { x: 6, y: 0, w: 18, h: 24 });

            expect(applied).toEqual({ x: 6, y: 0, w: 18, h: 24 });
            expect(rect(next, 'A')).toEqual({ x: 0, y: 0, w: 6, h: 24 });
            expectNoOverlap(next);
            expectWithinBounds(next);
        });

        it('頂到畫布左緣時停住', () => {
            const windows = [win('A', 0, 0, 6, 24), win('B', 6, 0, 18, 24)];

            const { windows: next, applied } = push(windows, 'B', { x: 0, y: 0, w: 24, h: 24 });

            expect(applied.x).toBe(6); // A 已是最小寬度，讓不出來
            expectNoOverlap(next);
            expectWithinBounds(next);
        });
    });

    describe('垂直方向', () => {
        it('往下推：容器可長高，鄰居只平移不被壓縮', () => {
            const windows = [win('A', 0, 0, 12, 12), win('C', 0, 12, 12, 12)];

            const { windows: next, applied } = push(windows, 'A', { x: 0, y: 0, w: 12, h: 18 });

            expect(applied.h).toBe(18);
            expect(rect(next, 'C')).toEqual({ x: 0, y: 18, w: 12, h: 12 }); // 尺寸不變，只往下移
            expectNoOverlap(next);
            expectWithinBounds(next);
        });

        it('往上推：受 y=0 限制，上鄰被壓縮', () => {
            const windows = [win('A', 0, 0, 12, 12), win('C', 0, 12, 12, 12)];

            const { windows: next, applied } = push(windows, 'C', { x: 0, y: 6, w: 12, h: 18 });

            expect(applied).toEqual({ x: 0, y: 6, w: 12, h: 18 });
            expect(rect(next, 'A')).toEqual({ x: 0, y: 0, w: 12, h: 6 });
            expectNoOverlap(next);
            expectWithinBounds(next);
        });
    });

    describe('角落雙軸', () => {
        it('同時往右下擴張，兩軸各自解算', () => {
            const windows = [
                win('A', 0, 0, 12, 12),
                win('B', 12, 0, 12, 12),
                win('C', 0, 12, 12, 12),
                win('D', 12, 12, 12, 12),
            ];

            const { windows: next, applied } = push(windows, 'A', { x: 0, y: 0, w: 18, h: 18 });

            expect(applied).toEqual({ x: 0, y: 0, w: 18, h: 18 });
            expect(rect(next, 'B').x).toBe(18);
            expect(rect(next, 'C').y).toBe(18);
            expectNoOverlap(next);
            expectWithinBounds(next);
        });
    });

    describe('縮小與邊界情形', () => {
        it('縮到比最小尺寸還小時夾回最小值', () => {
            const windows = [win('A', 0, 0, 12, 12)];

            const { applied } = push(windows, 'A', { x: 0, y: 0, w: 2, h: 2 });

            expect(applied.w).toBe(6);
            expect(applied.h).toBe(6);
        });

        it('chat 視窗的最小寬度是 3，可讓出比 stream 更多空間', () => {
            const windows = [win('A', 0, 0, 20, 24), win('C', 20, 0, 4, 24, 'chat')];

            const { windows: next, applied } = push(windows, 'A', { x: 0, y: 0, w: 24, h: 24 });

            expect(applied.w).toBe(21); // chat 只能從 4 壓到 3
            expect(rect(next, 'C')).toEqual({ x: 21, y: 0, w: 3, h: 24 });
            expectNoOverlap(next);
            expectWithinBounds(next);
        });

        it('找不到指定的視窗時原樣回傳', () => {
            const windows = [win('A', 0, 0, 12, 12)];
            const { windows: next } = push(windows, 'nope', { x: 0, y: 0, w: 18, h: 12 });
            expect(next).toEqual(windows);
        });
    });

    describe('縮小自動回填', () => {
        const quad = () => [
            win('A', 0, 0, 12, 12),
            win('B', 12, 0, 12, 12),
            win('C', 0, 12, 12, 12),
            win('D', 12, 12, 12, 12),
        ];

        it('C 右緣往左縮 → D 往左補上，同排以外不受影響', () => {
            const { windows: next, applied } = push(quad(), 'C', { x: 0, y: 12, w: 6, h: 12 });

            expect(applied.w).toBe(6);
            expect(rect(next, 'D')).toEqual({ x: 6, y: 12, w: 18, h: 12 });
            expect(rect(next, 'A')).toEqual({ x: 0, y: 0, w: 12, h: 12 });
            expect(rect(next, 'B')).toEqual({ x: 12, y: 0, w: 12, h: 12 });
            expectNoOverlap(next);
            expectWithinBounds(next);
        });

        it('A 下緣往上縮 → C 往上補上', () => {
            const { windows: next, applied } = push(quad(), 'A', { x: 0, y: 0, w: 12, h: 6 });

            expect(applied.h).toBe(6);
            expect(rect(next, 'C')).toEqual({ x: 0, y: 6, w: 12, h: 18 });
            expect(rect(next, 'B')).toEqual({ x: 12, y: 0, w: 12, h: 12 });
            expectNoOverlap(next);
        });

        it('B 左緣往右縮 → A 往右補上', () => {
            const { windows: next } = push(quad(), 'B', { x: 18, y: 0, w: 6, h: 12 });

            expect(rect(next, 'A')).toEqual({ x: 0, y: 0, w: 18, h: 12 });
            expectNoOverlap(next);
        });

        it('鄰居比空隙寬時不補，那塊留白（擴張會壓到第三者）', () => {
            const windows = [
                win('A', 0, 0, 12, 12),
                win('B', 12, 0, 12, 12),
                win('C', 0, 12, 24, 12), // 橫跨全寬
            ];

            const { windows: next } = push(windows, 'A', { x: 0, y: 0, w: 12, h: 6 });

            // C 往上長會蓋到 B，所以維持原狀
            expect(rect(next, 'C')).toEqual({ x: 0, y: 12, w: 24, h: 12 });
            expectNoOverlap(next);
        });

        it('靠畫布邊界縮小時留白，不誤拉其他視窗', () => {
            const windows = [win('A', 0, 0, 12, 24), win('B', 12, 0, 12, 24)];

            // B 的右緣就是畫布邊界，往左縮之後右側沒有鄰居可補
            const { windows: next, applied } = push(windows, 'B', { x: 12, y: 0, w: 6, h: 24 });

            expect(applied.w).toBe(6);
            expect(rect(next, 'A')).toEqual({ x: 0, y: 0, w: 12, h: 24 }); // A 在另一側，不該被拉過來
            expectNoOverlap(next);
        });

        it('chat 受寬度上限 4 約束，補不完的部分留白', () => {
            const windows = [win('A', 0, 0, 20, 24), win('C', 20, 0, 4, 24, 'chat')];

            // A 縮到 14，讓出 6 格；chat 只能從 4 長到 4（已達上限）→ 完全不動
            const { windows: next } = push(windows, 'A', { x: 0, y: 0, w: 14, h: 24 });

            expect(rect(next, 'C')).toEqual({ x: 20, y: 0, w: 4, h: 24 });
            expectNoOverlap(next);
        });

        it('角落同時縮兩軸：水平補滿整條，垂直方向留白', () => {
            const { windows: next } = push(quad(), 'A', { x: 0, y: 0, w: 6, h: 6 });

            // 水平空隙取原本的全高，所以 B 補滿整條 y=[0,12)
            expect(rect(next, 'B')).toEqual({ x: 6, y: 0, w: 18, h: 12 });
            // 垂直空隙只剩 x=[0,6)，而 C 寬 12 —— 往上長會撞到剛補位的 B，因此不動。
            // 角落雙軸縮小必然有一塊補不到，這是「只動緊鄰」換取可預測性的代價。
            expect(rect(next, 'C')).toEqual({ x: 0, y: 12, w: 12, h: 12 });
            expectNoOverlap(next);
            expectWithinBounds(next);
        });
    });

    describe('連鎖填滿', () => {
        // 與 NewCanvasPage 一致：多個方向都補得滿時優先放大直播畫面
        const preferStream = (w: W) => (w.type === 'stream' ? 1 : 0);
        const fill = (windows: W[]) =>
            resolveChainFill(windows, { gridCols: GRID_COLS, limitsOf: minSize, prefer: preferStream });

        const expectNoGaps = (windows: W[]) =>
            expect(findEmptyRects(windows, GRID_COLS)).toEqual([]);

        it('關掉 B 之後，左鄰 A 往右擴張佔滿上排（水平優先）', () => {
            const rest = [
                win('A', 0, 0, 12, 12),
                win('C', 0, 12, 12, 12),
                win('D', 12, 12, 12, 12),
            ];

            const next = fill(rest);

            expect(rect(next, 'A')).toEqual({ x: 0, y: 0, w: 24, h: 12 });
            expect(rect(next, 'C')).toEqual({ x: 0, y: 12, w: 12, h: 12 });
            expect(rect(next, 'D')).toEqual({ x: 12, y: 12, w: 12, h: 12 });
            expectNoGaps(next);
            expectNoOverlap(next);
            expectWithinBounds(next);
        });

        it('左側沒有鄰居時改由右鄰往左補', () => {
            const next = fill([win('B', 12, 0, 12, 24)]);

            expect(rect(next, 'B')).toEqual({ x: 0, y: 0, w: 24, h: 24 });
            expectNoGaps(next);
        });

        it('水平都不行時退而用垂直方向', () => {
            const next = fill([win('C', 0, 12, 24, 12)]);

            expect(rect(next, 'C')).toEqual({ x: 0, y: 0, w: 24, h: 24 });
            expectNoGaps(next);
        });

        it('多個鄰居合起來剛好覆蓋空白時一起補', () => {
            const next = fill([win('C', 0, 12, 12, 12), win('D', 12, 12, 12, 12)]);

            expect(rect(next, 'C')).toEqual({ x: 0, y: 0, w: 12, h: 24 });
            expect(rect(next, 'D')).toEqual({ x: 12, y: 0, w: 12, h: 24 });
            expectNoGaps(next);
            expectNoOverlap(next);
        });

        it('連鎖：擋路的聊天室平移讓道，由後方的直播畫面吸收', () => {
            // 空白 x=[4,8)。兩側緊鄰的都是已達寬度上限 4 的聊天室，單層補不動。
            const rest = [
                win('CHAT_L', 0, 0, 4, 24, 'chat'),
                win('CHAT_R', 8, 0, 4, 24, 'chat'),
                win('S', 12, 0, 12, 24),
            ];

            const next = fill(rest);

            // CHAT_R 整體左移把空白推給 S，S 吸收掉 —— 聊天室尺寸不變
            expect(rect(next, 'CHAT_R')).toEqual({ x: 4, y: 0, w: 4, h: 24 });
            expect(rect(next, 'S')).toEqual({ x: 8, y: 0, w: 16, h: 24 });
            expect(rect(next, 'CHAT_L')).toEqual({ x: 0, y: 0, w: 4, h: 24 });
            expectNoGaps(next);
            expectNoOverlap(next);
            expectWithinBounds(next);
        });

        it('連鎖到底仍吸收不了時整條不動', () => {
            // 右邊只有一個聊天室，平移之後沒有人接手
            const rest = [win('CHAT', 12, 0, 4, 24, 'chat')];

            const next = fill(rest);

            expect(next).toEqual(rest);
        });

        it('鄰居橫跨的範圍比空白寬時填不了，留白（數學上無解）', () => {
            const rest = [
                win('A', 0, 0, 12, 6),
                win('B', 12, 0, 12, 12),
                win('C', 0, 12, 24, 12),
            ];

            // exclude 模擬「A 是使用者剛縮小的那個」，不能把它長回去當成填補
            const next = resolveChainFill(rest, {
                gridCols: GRID_COLS, limitsOf: minSize, prefer: preferStream, exclude: 'A',
            });

            // C 往上長會壓到 B；B 的高度範圍又不落在空白內 —— 只能留白
            expect(next).toEqual(rest);
            expect(findEmptyRects(next, GRID_COLS)).toEqual([{ x: 0, y: 6, w: 12, h: 6 }]);
        });

        it('關閉視窗的情境下（沒有 exclude），上方鄰居可以往下長把空白吃掉', () => {
            const rest = [
                win('A', 0, 0, 12, 6),
                win('B', 12, 0, 12, 12),
                win('C', 0, 12, 24, 12),
            ];

            const next = fill(rest);

            expect(rect(next, 'A')).toEqual({ x: 0, y: 0, w: 12, h: 12 });
            expectNoGaps(next);
            expectNoOverlap(next);
        });

        it('兩邊都補得滿時優先讓直播畫面變大', () => {
            const rest = [
                win('CHAT', 0, 0, 4, 24, 'chat'),
                win('S', 16, 0, 8, 24),
            ];

            const next = fill(rest);

            expect(rect(next, 'CHAT')).toEqual({ x: 0, y: 0, w: 4, h: 24 });
            expect(rect(next, 'S')).toEqual({ x: 4, y: 0, w: 20, h: 24 });
            expectNoGaps(next);
        });

        it('已經填滿時不動任何東西', () => {
            const rest = [
                win('A', 0, 0, 12, 12), win('B', 12, 0, 12, 12),
                win('C', 0, 12, 12, 12), win('D', 12, 12, 12, 12),
            ];

            expect(fill(rest)).toEqual(rest);
        });
    });

    describe('findEmptyRects', () => {
        it('滿版佈局沒有空白', () => {
            expect(findEmptyRects([
                win('A', 0, 0, 12, 24), win('B', 12, 0, 12, 24),
            ], GRID_COLS)).toEqual([]);
        });

        it('底部以下不算空白（容器本來就可以往下長）', () => {
            expect(findEmptyRects([win('A', 0, 0, 24, 6)], GRID_COLS)).toEqual([]);
        });

        it('把不相鄰的空白切成多塊', () => {
            const gaps = findEmptyRects([
                win('A', 0, 0, 6, 12),
                win('B', 12, 0, 12, 12),
                win('C', 0, 12, 24, 12),
            ], GRID_COLS);

            expect(gaps).toEqual([{ x: 6, y: 0, w: 6, h: 12 }]);
        });
    });

    describe('隨機佈局的不變式', () => {
        // 固定種子的 LCG，讓失敗案例可重現
        const makeRng = (seed: number) => () => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };

        /** 用 guillotine 切分產生滿版、不重疊的隨機佈局 */
        const randomLayout = (rng: () => number, count: number): W[] => {
            let rects = [{ x: 0, y: 0, w: 24, h: 24 }];
            while (rects.length < count) {
                // 挑一個切得動的矩形
                const splittable = rects.filter(r => r.w >= 12 || r.h >= 12);
                if (splittable.length === 0) break;
                const victim = splittable[Math.floor(rng() * splittable.length)];
                rects = rects.filter(r => r !== victim);

                const canVertical = victim.w >= 12;
                const vertical = canVertical && (victim.h < 12 || rng() < 0.5);
                if (vertical) {
                    const cut = 6 + Math.floor(rng() * (victim.w - 11));
                    rects.push({ ...victim, w: cut }, { ...victim, x: victim.x + cut, w: victim.w - cut });
                } else {
                    const cut = 6 + Math.floor(rng() * (victim.h - 11));
                    rects.push({ ...victim, h: cut }, { ...victim, y: victim.y + cut, h: victim.h - cut });
                }
            }
            return rects.map((r, i) => win(`W${i}`, r.x, r.y, r.w, r.h));
        };

        it.each([20260805, 1337, 99991])('任意佈局、任意 resize 後都不重疊、不越界、不低於最小尺寸 (seed %i)', (seed) => {
            const rng = makeRng(seed);

            for (let iteration = 0; iteration < 800; iteration++) {
                const windows = randomLayout(rng, 2 + Math.floor(rng() * 6));
                const target = windows[Math.floor(rng() * windows.length)];

                // 四個方向隨機拉一段，含刻意超過畫布的極端值
                const desired = {
                    x: Math.max(0, target.gridX + Math.floor(rng() * 13) - 6),
                    y: Math.max(0, target.gridY + Math.floor(rng() * 13) - 6),
                    w: 1 + Math.floor(rng() * 30),
                    h: 1 + Math.floor(rng() * 30),
                };

                const { windows: next, applied } = push(windows, target.id, desired);

                try {
                    expectNoOverlap(next);
                    expectWithinBounds(next);
                } catch (err) {
                    console.error('失敗案例', JSON.stringify({ windows, movingId: target.id, desired, next, applied }, null, 2));
                    throw err;
                }
                expect(Number.isFinite(applied.x) && Number.isFinite(applied.y)).toBe(true);
                expect(Number.isFinite(applied.w) && Number.isFinite(applied.h)).toBe(true);
                // 視窗數量不變，沒有人被弄丟
                expect(next).toHaveLength(windows.length);
            }
        });

        const emptyArea = (windows: W[]) =>
            findEmptyRects(windows, GRID_COLS).reduce((sum, r) => sum + r.w * r.h, 0);

        it.each([20260805, 4242, 31337])('連鎖填補只會讓空白變少，不會製造新的破洞 (seed %i)', (seed) => {
            const rng = makeRng(seed);

            for (let iteration = 0; iteration < 600; iteration++) {
                const windows = randomLayout(rng, 2 + Math.floor(rng() * 6));
                // 隨機關掉一個視窗製造空洞
                const victim = windows[Math.floor(rng() * windows.length)];
                const rest = windows.filter(w => w.id !== victim.id);
                if (rest.length === 0) continue;

                const before = emptyArea(rest);
                const after = resolveChainFill(rest, {
                    gridCols: GRID_COLS,
                    limitsOf: minSize,
                    prefer: w => (w.type === 'stream' ? 1 : 0),
                });

                try {
                    expectNoOverlap(after);
                    expectWithinBounds(after);
                    expect(emptyArea(after), '填補後空白反而變多').toBeLessThanOrEqual(before);
                    expect(after).toHaveLength(rest.length);
                } catch (err) {
                    console.error('填補失敗案例', JSON.stringify({ rest, removed: victim.id, after }, null, 2));
                    throw err;
                }
            }
        });
    });
});
