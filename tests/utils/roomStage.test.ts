// 房間模式舞台版面：一台大、其餘疊在右側候場欄；畫布格線 24 欄 × 24 列
import { describe, it, expect } from 'vitest';
import { stageLayout, focusMuteUpdates } from '../../src/utils/roomStage';
import type { CanvasItem } from '../../src/types/canvas';

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const S = (i: string, contentId: number | null, layout = L(0, 0, 6, 6)): CanvasItem => ({ i, type: 'stream', contentId, layout });
const C = (i: string, contentId: number | null, layout = L(18, 0, 6, 24), sharedChat?: boolean): CanvasItem =>
    ({ i, type: 'chat', contentId, layout, ...(sharedChat ? { sharedChat } : {}) });
/** 先斷言結果不是 null（失敗時是斷言錯誤而非 TypeError），再回傳 */
const must = (items: CanvasItem[] | null): CanvasItem[] => {
    expect(items).not.toBeNull();
    return items as CanvasItem[];
};
const layoutOf = (items: CanvasItem[] | null, id: string) => must(items).find(it => it.i === id)!.layout;

describe('stageLayout：串流區', () => {
    it('只有一路串流且沒有聊天室時，焦點鋪滿整個畫布', () => {
        const out = stageLayout([S('a', 1)], 'a', 6);
        expect(layoutOf(out, 'a')).toEqual(L(0, 0, 24, 24));
    });

    it('只有一路串流加聊天室時，焦點寬度為 24 減聊天室欄寬', () => {
        const out = stageLayout([S('a', 1), C('c', 1)], 'a', 6);
        expect(layoutOf(out, 'a')).toEqual(L(0, 0, 18, 24));
    });

    it('聊天室欄寬不是預設值時，串流區寬度跟著改變', () => {
        const out = stageLayout([S('a', 1), C('c', 1)], 'a', 8);
        expect(layoutOf(out, 'a')).toEqual(L(0, 0, 16, 24));
        expect(layoutOf(out, 'c')).toEqual(L(16, 0, 8, 24));
    });

    it('兩路串流加聊天室時，焦點寬 A−6、另一路佔滿候場欄', () => {
        const out = stageLayout([S('a', 1), S('b', 2), C('c', 1)], 'b', 6);
        expect(layoutOf(out, 'b')).toEqual(L(0, 0, 12, 24));
        expect(layoutOf(out, 'a')).toEqual(L(12, 0, 6, 24));
    });

    it('兩路串流且沒有聊天室時，候場欄貼在右緣（x=18）', () => {
        const out = stageLayout([S('a', 1), S('b', 2)], 'a', 6);
        expect(layoutOf(out, 'a')).toEqual(L(0, 0, 18, 24));
        expect(layoutOf(out, 'b')).toEqual(L(18, 0, 6, 24));
    });

    it('三個其他串流時，候場欄上下三等分（各高 8）', () => {
        const items = [S('a', 1), S('b', 2), S('c', 3), S('d', 4)];
        const out = stageLayout(items, 'a', 6);
        expect(layoutOf(out, 'b')).toEqual(L(18, 0, 6, 8));
        expect(layoutOf(out, 'c')).toEqual(L(18, 8, 6, 8));
        expect(layoutOf(out, 'd')).toEqual(L(18, 16, 6, 8));
    });

    it('候場串流依原本位置（先 y 再 x）排序，而不是依陣列順序', () => {
        const items = [
            S('f', 1, L(0, 0, 6, 6)),
            S('right', 2, L(12, 0, 6, 6)),   // y=0 但 x 較大
            S('bottom', 3, L(0, 12, 6, 6)),  // y 最大
            S('left', 4, L(0, 0, 6, 6)),     // y=0 且 x 最小
        ];
        const out = stageLayout(items, 'f', 6);
        expect(layoutOf(out, 'left').y).toBe(0);
        expect(layoutOf(out, 'right').y).toBe(8);
        expect(layoutOf(out, 'bottom').y).toBe(16);
    });

    it('候場串流之間不重疊且剛好填滿 24 列（四個其他串流）', () => {
        const items = [S('a', 1), S('b', 2), S('c', 3), S('d', 4), S('e', 5)];
        const out = must(stageLayout(items, 'a', 6));
        const others = out.filter(it => it.i !== 'a').map(it => it.layout).sort((p, q) => p.y - q.y);
        expect(others[0].y).toBe(0);
        for (let k = 1; k < others.length; k++) expect(others[k].y).toBe(others[k - 1].y + others[k - 1].h);
        expect(others[others.length - 1].y + others[others.length - 1].h).toBe(24);
    });

    it('contentId 為 null 的空槽也算串流（算進候場、也能當焦點）', () => {
        const out = stageLayout([S('a', 1), S('empty', null)], 'a', 6);
        expect(layoutOf(out, 'empty')).toEqual(L(18, 0, 6, 24));
        const out2 = stageLayout([S('a', 1), S('empty', null)], 'empty', 6);
        expect(layoutOf(out2, 'empty')).toEqual(L(0, 0, 18, 24));
    });
});

describe('stageLayout：聊天室', () => {
    it('單一聊天室佔滿右欄（x=24−c、w=c、y=0、h=24）', () => {
        const out = stageLayout([S('a', 1), S('b', 2), C('c', 1)], 'a', 6);
        expect(layoutOf(out, 'c')).toEqual(L(18, 0, 6, 24));
    });

    it('多個聊天室在右欄上下平分', () => {
        const items = [S('a', 1), S('b', 2), C('c1', 1, L(18, 0, 6, 12)), C('c2', 2, L(18, 12, 6, 12))];
        const out = stageLayout(items, 'a', 6);
        expect(layoutOf(out, 'c1')).toEqual(L(18, 0, 6, 12));
        expect(layoutOf(out, 'c2')).toEqual(L(18, 12, 6, 12));
        expect(layoutOf(out, 'a')).toEqual(L(0, 0, 12, 24));
    });

    it('聊天室全部收合時有效寬為 0：焦點鋪滿 24、收合聊天室維持 x:24 w:0', () => {
        const out = stageLayout([S('a', 1), C('c', 1, L(24, 0, 0, 24))], 'a', 6);
        expect(layoutOf(out, 'a')).toEqual(L(0, 0, 24, 24));
        expect(layoutOf(out, 'c')).toEqual(L(24, 0, 0, 24));
    });

    it('聊天室收合時候場欄貼在 x=18（A=24）而不是留空聊天室欄', () => {
        const out = stageLayout([S('a', 1), S('b', 2), C('c', 1, L(24, 0, 0, 24))], 'a', 6);
        expect(layoutOf(out, 'a')).toEqual(L(0, 0, 18, 24));
        expect(layoutOf(out, 'b')).toEqual(L(18, 0, 6, 24));
    });

    it('一個收合、一個展開時，展開的獨佔右欄、收合的不動', () => {
        const items = [S('a', 1), C('open', 1, L(18, 0, 6, 12)), C('closed', 2, L(24, 0, 0, 24))];
        const out = stageLayout(items, 'a', 6);
        expect(layoutOf(out, 'open')).toEqual(L(18, 0, 6, 24));
        expect(layoutOf(out, 'closed')).toEqual(L(24, 0, 0, 24));
        expect(layoutOf(out, 'a')).toEqual(L(0, 0, 18, 24));
    });
});

describe('stageLayout：保留與例外', () => {
    it('每個 item 的 i、contentId、sharedChat、type 不變，順序與輸入相同', () => {
        const items = [C('c', 2, L(18, 0, 6, 24), true), S('a', 1), S('b', 2), S('e', null)];
        const out = must(stageLayout(items, 'b', 6));
        expect(out.map(it => it.i)).toEqual(['c', 'a', 'b', 'e']);
        expect(out.map(it => it.contentId)).toEqual([2, 1, 2, null]);
        expect(out.map(it => it.type)).toEqual(['chat', 'stream', 'stream', 'stream']);
        expect(out[0].sharedChat).toBe(true);
        expect(out[1].sharedChat).toBeUndefined();
    });

    it('不會改動傳入的 items（純函式）', () => {
        const items = [S('a', 1, L(0, 0, 6, 6)), S('b', 2, L(6, 0, 6, 6))];
        const snapshot = JSON.parse(JSON.stringify(items));
        stageLayout(items, 'b', 6);
        expect(items).toEqual(snapshot);
    });

    it('焦點 id 不存在時回傳 null', () => {
        expect(stageLayout([S('a', 1)], 'nope', 6)).toBeNull();
    });

    it('焦點是聊天室時回傳 null', () => {
        expect(stageLayout([S('a', 1), C('c', 1)], 'c', 6)).toBeNull();
    });

    it('其他串流恰好 4 路時可以排；5 路時回傳 null', () => {
        const four = [S('a', 1), S('b', 2), S('c', 3), S('d', 4), S('e', 5)];
        expect(stageLayout(four, 'a', 6)).not.toBeNull();
        const five = [...four, S('f', 6)];
        expect(stageLayout(five, 'a', 6)).toBeNull();
    });

    it('空 items 時回傳 null', () => {
        expect(stageLayout([], 'a', 6)).toBeNull();
    });
});

describe('focusMuteUpdates', () => {
    it('焦點原本靜音、其他未靜音時，焦點取消靜音、其他全部靜音', () => {
        const out = focusMuteUpdates([{ id: 1, isMuted: true }, { id: 2, isMuted: false }, { id: 3, isMuted: false }], 1);
        expect(out).toHaveLength(3);
        expect(out).toEqual(expect.arrayContaining([{ id: 1, isMuted: false }, { id: 2, isMuted: true }, { id: 3, isMuted: true }]));
    });

    it('已經是正確狀態的串流不回傳（只回傳需要改的）', () => {
        const out = focusMuteUpdates([{ id: 1, isMuted: false }, { id: 2, isMuted: true }, { id: 3, isMuted: false }], 1);
        expect(out).toEqual([{ id: 3, isMuted: true }]);
    });

    it('全部已符合時回傳空陣列', () => {
        expect(focusMuteUpdates([{ id: 1, isMuted: false }, { id: 2, isMuted: true }], 1)).toEqual([]);
    });

    it('isMuted 未定義視為未靜音：焦點不用改、其他要靜音', () => {
        const out = focusMuteUpdates([{ id: 1 }, { id: 2 }], 1);
        expect(out).toEqual([{ id: 2, isMuted: true }]);
    });

    it('焦點 id 不在清單時回傳空陣列（不誤把所有路靜音）', () => {
        expect(focusMuteUpdates([{ id: 1, isMuted: false }, { id: 2, isMuted: false }], 99)).toEqual([]);
    });
});
