import { describe, it, expect } from 'vitest';
import { sanitizeCustomLayouts } from '../../../src/features/backup/customLayoutsBackup';

// 備份檔曾不含自訂布局（2026-10）：匯出補上 customLayouts，匯入時先整理再寫回 store
describe('sanitizeCustomLayouts', () => {
    const valid = {
        id: 'a1', name: '比賽四視角', createdAt: 1700000000000,
        slots: [
            { x: 0, y: 0, w: 20, h: 24, type: 'stream' },
            { x: 20, y: 0, w: 4, h: 24, type: 'chat', sharedChat: true },
        ],
    };

    it('舊版備份檔沒有 customLayouts 欄位：回傳 null（呼叫端保留現有布局）', () => {
        expect(sanitizeCustomLayouts(undefined)).toBeNull();
        expect(sanitizeCustomLayouts({})).toBeNull();
    });

    it('正常的布局原樣保留', () => {
        expect(sanitizeCustomLayouts([valid])).toEqual([valid]);
    });

    it('空陣列代表備份時沒有自訂布局', () => {
        expect(sanitizeCustomLayouts([])).toEqual([]);
    });

    it('略過格式不對的布局、格子與多餘欄位', () => {
        const result = sanitizeCustomLayouts([
            null,
            { id: 'no-name', slots: valid.slots },
            { id: 'no-slots', name: 'x' },
            { id: 'bad-slots', name: 'x', slots: [{ x: 'a', y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 0, h: 6 }] },
            { ...valid, id: 'mixed', thumbnail: 'javascript:alert(1)', slots: [...valid.slots, { x: -1, y: 0, w: 6, h: 6 }] },
            { ...valid }, // 與第一個合法的 a1 重複 → 只留一個
            valid,
        ]);
        expect(result?.map(l => l.id)).toEqual(['mixed', 'a1']);
        expect(result?.[0]).not.toHaveProperty('thumbnail');
        expect(result?.[0].slots).toHaveLength(2);
    });

    it('缺 createdAt 時補上時間、過長名稱截斷', () => {
        const [l] = sanitizeCustomLayouts([{ id: 'b', name: 'n'.repeat(500), slots: valid.slots }])!;
        expect(typeof l.createdAt).toBe('number');
        expect(l.name).toHaveLength(100);
    });
});
