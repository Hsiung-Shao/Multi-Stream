// 聊天室欄寬與收合（階段 3 後半）：版面純函式
import { describe, it, expect } from 'vitest';
import {
    generateColumnLayout, clampChatCols, generateSharedChatLayout, columnLayoutVariants,
} from '../../src/utils/layoutPresets';
import {
    relayoutItems, collapseChats, expandChats, chatsCollapsed, isCollapsedChat, keepChatsCollapsed, sharedChatContentIdOf,
    chatColumnResizeKeepsLayout,
} from '../../src/utils/canvasItemOps';
import type { CanvasItem } from '../../src/types/canvas';
import { resizeLimitsOf } from '../../src/components/Canvas/sizeLimits';

const ASPECT = 16 / 9;

/** 每一格都恰好被一個視窗覆蓋（無縫、無重疊） */
function coverage(rects: { x: number; y: number; w: number; h: number }[], cols = 24, rows = 24) {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y][x]++;
    return grid.flat();
}

const item = (i: string, type: CanvasItem['type'], contentId: number | null, x: number, y: number, w: number, h: number, extra: Partial<CanvasItem> = {}): CanvasItem =>
    ({ i, type, contentId, layout: { x, y, w, h }, ...extra });

/** 2 串 + 1 共用聊天室（寬 4） */
const shared = (): CanvasItem[] => [
    item('s1', 'stream', 1, 0, 0, 20, 12),
    item('s2', 'stream', 2, 0, 12, 20, 12),
    item('c', 'chat', 1, 20, 0, 4, 24, { sharedChat: true }),
];

describe('generateColumnLayout 的聊天室欄寬', () => {
    it.each([3, 4, 6, 8])('寬 %i 欄：聊天室貼齊右緣，整個畫布無縫填滿', cols => {
        for (const [ns, nc] of [[1, 1], [3, 1], [4, 2]]) {
            const { streams, chats } = generateColumnLayout(ns, nc, ASPECT, cols);
            expect(chats.every(c => c.w === cols && c.x + c.w === 24)).toBe(true);
            expect(coverage([...streams, ...chats]).every(n => n === 1)).toBe(true);
        }
    });

    it('寬度會被夾在 3～8 之間；0 代表收合（串流填滿全寬、聊天室寬 0 貼在最右緣）', () => {
        expect(generateColumnLayout(2, 1, ASPECT, 20).chats[0].w).toBe(8);
        expect(generateColumnLayout(2, 1, ASPECT, 1).chats[0].w).toBe(3);
        const collapsed = generateColumnLayout(2, 1, ASPECT, 0);
        expect(collapsed.chats[0]).toMatchObject({ x: 24, w: 0 });
        expect(coverage(collapsed.streams).every(n => n === 1)).toBe(true);
    });

    it('共用聊天室版型沿用傳入的寬度', () => {
        const chat = (generateSharedChatLayout([1, 2, 3], ASPECT, 1, 6) as { type: string; w: number; x: number }[]).find(s => s.type === 'chat')!;
        expect(chat).toMatchObject({ x: 18, w: 6 });
    });

    it('clampChatCols：非數字退回預設、取整、夾在 3～8', () => {
        expect(clampChatCols(NaN)).toBe(4);
        expect(clampChatCols(5.4)).toBe(5);
        expect([0, 2, 9].map(clampChatCols)).toEqual([3, 3, 8]);
    });
});

describe('聊天室收合（寬 0 表示法）', () => {
    it('收合：串流填滿全寬、聊天室寬 0；i、contentId、sharedChat 都不變', () => {
        const before = shared();
        const after = collapseChats(before, ASPECT);
        expect(after.map(i => i.i)).toEqual(before.map(i => i.i));
        expect(after.map(i => i.contentId)).toEqual(before.map(i => i.contentId));
        expect(after.find(i => i.i === 'c')).toMatchObject({ sharedChat: true, layout: { x: 24, w: 0 } });
        expect(chatsCollapsed(after)).toBe(true);
        expect(coverage(after.filter(i => !isCollapsedChat(i)).map(i => i.layout)).every(n => n === 1)).toBe(true);
    });

    it('展開：恢復指定寬度並重新填滿', () => {
        const expanded = expandChats(collapseChats(shared(), ASPECT), ASPECT, 6);
        expect(expanded.find(i => i.i === 'c')!.layout).toMatchObject({ x: 18, w: 6 });
        expect(chatsCollapsed(expanded)).toBe(false);
        expect(coverage(expanded.map(i => i.layout)).every(n => n === 1)).toBe(true);
    });

    it('沒有聊天室時收合不做任何事', () => {
        const items = [item('s1', 'stream', 1, 0, 0, 24, 24)];
        expect(collapseChats(items, ASPECT)).toBe(items);
        expect(chatsCollapsed(items)).toBe(false);
    });

    it('收合中新增一路串流（relayoutItems）：維持收合', () => {
        const collapsed = collapseChats(shared(), ASPECT);
        const next = relayoutItems([...collapsed, item('s3', 'stream', 3, 0, 24, 6, 6)], ASPECT, ['s3'], 4);
        expect(chatsCollapsed(next)).toBe(true);
        expect(coverage(next.filter(i => !isCollapsedChat(i)).map(i => i.layout)).every(n => n === 1)).toBe(true);
    });

    it('收合中新增聊天室：全部展開（使用者就是要看聊天室）', () => {
        const collapsed = collapseChats(shared(), ASPECT);
        const next = relayoutItems([...collapsed, item('c2', 'chat', 2, 0, 24, 4, 6)], ASPECT, ['c2'], 5);
        expect(chatsCollapsed(next)).toBe(false);
        expect(next.filter(i => i.type === 'chat').every(c => c.layout.w === 5 && c.layout.x === 19)).toBe(true);
    });

    it('keepChatsCollapsed：原本收合就把新版面也收合，原本展開則原樣回傳', () => {
        const regenerated = shared();
        expect(chatsCollapsed(keepChatsCollapsed(collapseChats(shared(), ASPECT), regenerated, ASPECT))).toBe(true);
        expect(keepChatsCollapsed(shared(), regenerated, ASPECT)).toBe(regenerated);
    });

    it('收合時共用聊天室不算「正在顯示某一路」（串流工具列不顯示聊天室圖示）', () => {
        expect(sharedChatContentIdOf(shared())).toBe(1);
        expect(sharedChatContentIdOf(collapseChats(shared(), ASPECT))).toBeUndefined();
    });
});

describe('調寬／收合保留使用者排好的串流', () => {
    /** 一大三小：主畫面 w1 佔左側 12×24，右邊三路 8 欄各 8 列；聊天室寬 4 */
    const custom = (): CanvasItem[] => [
        item('w1', 'stream', 1, 0, 0, 12, 24),
        item('w2', 'stream', 2, 12, 0, 8, 8),
        item('w3', 'stream', 3, 12, 8, 8, 8),
        item('w4', 'stream', 4, 12, 16, 8, 8),
        item('c', 'chat', 1, 20, 0, 4, 24, { sharedChat: true }),
    ];

    it('收合：欄線依比例放寬，上下位置與高度不動，主畫面仍是最大那格', () => {
        const after = collapseChats(custom(), ASPECT);
        const w = (id: string) => after.find(i => i.i === id)!.layout;
        expect(w('w1')).toEqual({ x: 0, y: 0, w: 14, h: 24 });
        expect(w('w2')).toEqual({ x: 14, y: 0, w: 10, h: 8 });
        expect(w('w4')).toEqual({ x: 14, y: 16, w: 10, h: 8 });
        expect(coverage(after.filter(i => !isCollapsedChat(i)).map(i => i.layout)).every(n => n === 1)).toBe(true);
    });

    it('收合再展開：回到原本的排法', () => {
        const back = expandChats(collapseChats(custom(), ASPECT), ASPECT, 4);
        expect(back.map(i => i.layout)).toEqual(custom().map(i => i.layout));
    });

    it('調寬到 8：仍保留一大三小、整個畫布無縫', () => {
        const after = expandChats(custom(), ASPECT, 8);
        expect(after.find(i => i.i === 'w1')!.layout).toEqual({ x: 0, y: 0, w: 10, h: 24 });
        expect(after.find(i => i.i === 'c')!.layout).toEqual({ x: 16, y: 0, w: 8, h: 24 });
        expect(coverage(after.map(i => i.layout)).every(n => n === 1)).toBe(true);
    });

    it('縮放後有串流窄於 6 欄：退回整個重排（不產生過窄的視窗）', () => {
        const three = [
            item('a', 'stream', 1, 0, 0, 7, 24), item('b', 'stream', 2, 7, 0, 7, 24), item('d', 'stream', 3, 14, 0, 6, 24),
            item('c', 'chat', 1, 20, 0, 4, 24),
        ];
        const after = expandChats(three, ASPECT, 8);
        expect(after.filter(i => i.type === 'stream').every(i => i.layout.w >= 6)).toBe(true);
        expect(coverage(after.map(i => i.layout)).every(n => n === 1)).toBe(true);
    });

    it('沒有聊天室：什麼都不做（不重排使用者的串流）', () => {
        const items = [item('a', 'stream', 1, 0, 0, 16, 24), item('b', 'stream', 2, 16, 0, 8, 24)];
        expect(expandChats(items, ASPECT, 6)).toBe(items);
        expect(collapseChats(items, ASPECT)).toBe(items);
    });
});

// code review 2026-10-08：多路直播＋右側聊天室欄放不下 6×6 時，舊版疊成單一欄、往下長到 78～96 列
describe('多路直播＋聊天室欄：維持多欄網格、不超出畫布高度', () => {
    const cases: [number, number][] = [];
    for (let n = 9; n <= 16; n++) for (const cols of [3, 4, 6, 8]) cases.push([n, cols]);

    it.each(cases)('%i 路、聊天室寬 %i：串流都在 24 列內、多於一欄、與聊天室一起無縫填滿', (n, cols) => {
        const { streams, chats } = generateColumnLayout(n, 1, ASPECT, cols);
        expect(streams).toHaveLength(n);
        expect(Math.max(...streams.map(s => s.y + s.h))).toBeLessThanOrEqual(24);
        expect(new Set(streams.map(s => s.x)).size).toBeGreaterThan(1);
        expect(streams.every(s => s.w > 0 && s.h > 0)).toBe(true);
        expect(coverage([...streams, ...chats]).every(c => c === 1)).toBe(true);
    });

    it('放得下 6×6 時仍守住最小尺寸（行為不變）', () => {
        const { streams } = generateColumnLayout(12, 1, ASPECT, 4);
        expect(streams.every(s => s.w >= 6 && s.h >= 6)).toBe(true);
    });

    it('relayoutItems：14 路加 1 聊（新增視窗後的重排）也留在畫布內', () => {
        const items: CanvasItem[] = [
            ...Array.from({ length: 14 }, (_, k) => item(`s${k}`, 'stream', k + 1, 0, k * 6, 6, 6)),
            item('c', 'chat', 1, 20, 0, 4, 24, { sharedChat: true }),
        ];
        const next = relayoutItems(items, ASPECT, [], 4);
        expect(Math.max(...next.map(i => i.layout.y + i.layout.h))).toBe(24);
        expect(coverage(next.map(i => i.layout)).every(c => c === 1)).toBe(true);
    });

    it('調寬聊天室到 8（串流區只剩 16 欄）：13 路仍在畫布內', () => {
        const items = relayoutItems([
            ...Array.from({ length: 13 }, (_, k) => item(`s${k}`, 'stream', k + 1, 0, 0, 6, 6)),
            item('c', 'chat', 1, 20, 0, 4, 24),
        ], ASPECT, [], 4);
        const wide = expandChats(items, ASPECT, 8);
        expect(wide.find(i => i.i === 'c')!.layout).toMatchObject({ x: 16, w: 8, h: 24 });
        expect(Math.max(...wide.map(i => i.layout.y + i.layout.h))).toBe(24);
        expect(coverage(wide.map(i => i.layout)).every(c => c === 1)).toBe(true);
    });
});

describe('調寬結果與原本相同時回傳原陣列（不觸發整畫布重繪）', () => {
    it('右側一欄：選目前已是的寬度 → 同一個陣列', () => {
        const items = shared();
        expect(expandChats(items, ASPECT, 4)).toBe(items);
    });

    it('重排路徑（每路一聊已重排成一欄後再選同寬）→ 同一個陣列', () => {
        const perStream = [
            item('w1', 'stream', 1, 0, 0, 8, 24), item('c1', 'chat', 1, 8, 0, 4, 24),
            item('w2', 'stream', 2, 12, 0, 8, 24), item('c2', 'chat', 2, 20, 0, 4, 24),
        ];
        const once = expandChats(perStream, ASPECT, 6);
        expect(once).not.toBe(perStream);
        expect(expandChats(once, ASPECT, 6)).toBe(once);
    });

    it('已收合再收合 → 同一個陣列', () => {
        const collapsed = collapseChats(shared(), ASPECT);
        expect(collapseChats(collapsed, ASPECT)).toBe(collapsed);
    });
});

// 第二輪審查：退回策略的格子尺寸下限語意（與縮放的 resizeLimitsOf 一起看）
describe('退回策略（放不下 6×6）的格子尺寸語意', () => {
    /** 串流區 cols 欄 × 24 列能不能用 6×6 以上的格子排下 n 路 */
    const fits6 = (n: number, cols: number) => Math.floor(cols / 6) * 4 >= n;

    it('只有確實放不下 6×6 時才退回；放得下就每格都 ≥ 6×6', () => {
        for (let n = 1; n <= 16; n++) for (const cols of [0, 3, 4, 6, 8]) {
            const { streams } = generateColumnLayout(n, cols === 0 ? 0 : 1, ASPECT, cols || 4);
            const area = cols === 0 ? 24 : 24 - cols;
            if (fits6(n, area)) expect(streams.every(s => s.w >= 6 && s.h >= 6)).toBe(true);
            else expect(streams.some(s => s.w < 6 || s.h < 6)).toBe(true);
        }
    });

    it.each([3, 4, 6, 8])('聊天室寬 %i、13～16 路退回時：每格至少 4×4，且全部留在 24 列內', cols => {
        for (let n = 13; n <= 16; n++) {
            const { streams } = generateColumnLayout(n, 1, ASPECT, cols);
            expect(streams.every(s => s.w >= 4 && s.h >= 4)).toBe(true);
            expect(Math.max(...streams.map(s => s.y + s.h))).toBeLessThanOrEqual(24);
        }
    });

    it('退回的小格子縮放時以自身尺寸為下限（resizeLimitsOf），不會被撐成 6×6', () => {
        const small = generateColumnLayout(13, 1, ASPECT, 4).streams[0];
        expect(small).toMatchObject({ w: 5, h: 6 });
        expect(resizeLimitsOf({ type: 'stream', gridW: small.w, gridH: small.h })).toMatchObject({ minW: 5, minH: 6 });
    });
});

describe('resizeLimitsOf：縮放用的限制', () => {
    it('一般尺寸的視窗：下限就是類型下限', () => {
        expect(resizeLimitsOf({ type: 'stream', gridW: 12, gridH: 12 })).toEqual({ minW: 6, minH: 6, maxW: Infinity });
        expect(resizeLimitsOf({ type: 'chat', gridW: 4, gridH: 24 })).toEqual({ minW: 3, minH: 6, maxW: 8 });
    });

    it('已比下限小：下限降到目前尺寸；比上限寬：上限升到目前寬度', () => {
        expect(resizeLimitsOf({ type: 'stream', gridW: 5, gridH: 4 })).toMatchObject({ minW: 5, minH: 4 });
        expect(resizeLimitsOf({ type: 'chat', gridW: 10, gridH: 24 }).maxW).toBe(10);
    });
});

describe('chatColumnResizeKeepsLayout：欄寬調整會不會破壞使用者排法', () => {
    it('依比例縮放做得到 → true', () => {
        expect(chatColumnResizeKeepsLayout(shared(), 6)).toBe(true);
    });

    it('自訂排法、縮放後有串流窄於 6 → false', () => {
        const custom = [
            item('a', 'stream', 1, 0, 0, 14, 20), item('b', 'stream', 2, 14, 0, 6, 20),
            item('d', 'stream', 3, 0, 20, 20, 10), item('c', 'chat', 1, 20, 0, 4, 24),
        ];
        expect(chatColumnResizeKeepsLayout(custom, 6)).toBe(false);
    });

    it('標準欄式排法（重排結果就是現況）→ true，即使依比例縮放做不到', () => {
        const std = relayoutItems([
            ...Array.from({ length: 13 }, (_, k) => item(`s${k}`, 'stream', k + 1, 0, 0, 6, 6)),
            item('c', 'chat', 1, 20, 0, 4, 24),
        ], ASPECT, [], 4);
        expect(chatColumnResizeKeepsLayout(std, 6)).toBe(true);
    });

    it('沒有聊天室 → false', () => {
        expect(chatColumnResizeKeepsLayout([item('a', 'stream', 1, 0, 0, 24, 24)], 6)).toBe(false);
    });
});

// 第四輪審查：「是否為標準欄式排法」不受視窗比例變動影響
describe('標準欄式排法的判斷與螢幕比例無關', () => {
    const ASPECTS = { '16:9': 16 / 9, '4:3': 4 / 3, '21:9': 21 / 9, '9:16 直立': 9 / 16 };
    const toItems = (n: number, aspect: number, cols: number) => {
        const { streams, chats } = generateColumnLayout(n, 1, aspect, cols);
        return [
            ...streams.map((r, k) => item(`s${k}`, 'stream', k + 1, r.x, r.y, r.w, r.h)),
            item('c', 'chat', 1, chats[0].x, chats[0].y, chats[0].w, chats[0].h),
        ];
    };

    it('任一比例產生的標準版面都在 columnLayoutVariants 裡', () => {
        for (const a of Object.values(ASPECTS)) for (let n = 1; n <= 16; n++) for (const cols of [3, 4, 8]) {
            const { streams, chats } = generateColumnLayout(n, 1, a, cols);
            const variants = columnLayoutVariants(n, 1, cols);
            expect(variants.some(v => JSON.stringify(v.streams) === JSON.stringify(streams) && JSON.stringify(v.chats) === JSON.stringify(chats))).toBe(true);
        }
    });

    it('以比例 A 產生、比例 B 下重排結果不同的標準版面：仍判定為標準（欄寬調整不破壞排法）', () => {
        let checked = 0;
        for (const [na, a] of Object.entries(ASPECTS)) for (const [nb, b] of Object.entries(ASPECTS)) {
            if (na === nb) continue;
            for (let n = 2; n <= 16; n++) {
                const items = toItems(n, a, 4);
                const relaid = relayoutItems(items, b, [], 4);
                if (relaid.every((it, i) => JSON.stringify(it.layout) === JSON.stringify(items[i].layout))) continue;
                checked++;
                expect(chatColumnResizeKeepsLayout(items, 8)).toBe(true);
            }
        }
        expect(checked).toBeGreaterThan(0); // 確實有比例不同、重排會不一樣的案例被檢查到
    });

    it('自訂排法（一大兩小＋超過 24 列）在任何比例下都不是標準版面', () => {
        const custom = [
            item('a', 'stream', 1, 0, 0, 14, 20), item('b', 'stream', 2, 14, 0, 6, 20),
            item('d', 'stream', 3, 0, 20, 20, 10), item('c', 'chat', 1, 20, 0, 4, 24),
        ];
        expect(chatColumnResizeKeepsLayout(custom, 6)).toBe(false);
    });
});
