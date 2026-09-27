// 聊天室欄寬與收合（階段 3 後半）：版面純函式
import { describe, it, expect } from 'vitest';
import {
    generateColumnLayout, clampChatCols, generateSharedChatLayout,
} from '../../src/utils/layoutPresets';
import {
    relayoutItems, collapseChats, expandChats, chatsCollapsed, isCollapsedChat, keepChatsCollapsed, sharedChatContentIdOf,
} from '../../src/utils/canvasItemOps';
import type { CanvasItem } from '../../src/types/canvas';

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
