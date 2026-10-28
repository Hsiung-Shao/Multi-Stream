import { describe, it, expect } from 'vitest';
import { mergeReplaceRows } from '../../../src/features/songs/lib/timelineMerge';

const row = (start: number, title = `歌${start}`, line = 0) => ({ start, end: null, title, artist: null, line });

describe('mergeReplaceRows', () => {
    it('開始秒數完全相同：全部保留 id 與 code，lostCodes 為空', () => {
        const existing = [
            { id: 'i1', code: 'c1', start: 0 },
            { id: 'i2', code: 'c2', start: 100 },
            { id: 'i3', code: 'c3', start: 200 },
        ];
        const { rows, lostCodes } = mergeReplaceRows(existing, [row(0), row(100), row(200)]);
        expect(rows.map((r) => [r.id, r.code])).toEqual([['i1', 'c1'], ['i2', 'c2'], ['i3', 'c3']]);
        expect(lostCodes).toEqual([]);
    });

    it('改了一首的開始秒數：該首沒有 id，舊 code 進 lostCodes；其餘沿用', () => {
        const existing = [
            { id: 'i1', code: 'c1', start: 0 },
            { id: 'i2', code: 'c2', start: 100 },
            { id: 'i3', code: 'c3', start: 200 },
        ];
        const { rows, lostCodes } = mergeReplaceRows(existing, [row(0), row(100), row(250)]);
        expect(rows[0].code).toBe('c1');
        expect(rows[1].code).toBe('c2');
        expect(rows[2].id).toBeUndefined();
        expect(rows[2].code).toBeUndefined();
        expect(lostCodes).toEqual(['c3']);
    });

    it('舊列兩筆同開始秒數：每個舊列只配對一次，依 incoming 順序', () => {
        const existing = [
            { id: 'i1', code: 'c1', start: 0 },
            { id: 'i2', code: 'c2', start: 0 },
        ];
        const one = mergeReplaceRows(existing, [row(0)]);
        expect(one.rows[0]).toMatchObject({ id: 'i1', code: 'c1' });
        expect(one.lostCodes).toEqual(['c2']);

        const two = mergeReplaceRows(existing, [row(0, 'x'), row(0, 'y')]);
        expect(two.rows.map((r) => r.code)).toEqual(['c1', 'c2']);
        expect(two.lostCodes).toEqual([]);

        // incoming 多於舊列：多出來的沒有 id
        const three = mergeReplaceRows(existing, [row(0), row(0), row(0)]);
        expect(three.rows[2].id).toBeUndefined();
    });

    it('lostCodes 依舊列順序；尚未存檔（無 id/code）的舊列不影響 lostCodes', () => {
        const existing = [
            { id: 'i1', code: 'c1', start: 10 },
            { start: 20 },
            { id: 'i3', code: 'c3', start: 30 },
        ];
        const { rows, lostCodes } = mergeReplaceRows(existing, [row(99)]);
        expect(rows[0].id).toBeUndefined();
        expect(lostCodes).toEqual(['c1', 'c3']);
    });

    it('保留 incoming 的其他欄位與順序', () => {
        const incoming = [row(5, 'B', 3), row(0, 'A', 1)];
        const { rows } = mergeReplaceRows([{ id: 'i1', code: 'c1', start: 0 }], incoming);
        expect(rows.map((r) => r.title)).toEqual(['B', 'A']);
        expect(rows[1]).toMatchObject({ title: 'A', line: 1, id: 'i1', code: 'c1' });
    });
});

describe('mergeReplaceRows 只有 code 沒有 id 的舊列（社群編輯）', () => {
    it('舊列只有 code：依開始秒數配對並帶上 code，lostCodes 為空', () => {
        const existing = [
            { code: 'c1', start: 0 },
            { code: 'c2', start: 100 },
        ];
        const { rows, lostCodes } = mergeReplaceRows(existing, [row(0), row(100), row(200)]);
        expect(rows.map((r) => r.code)).toEqual(['c1', 'c2', undefined]);
        expect(rows.every((r) => r.id === undefined)).toBe(true);
        expect(lostCodes).toEqual([]);
    });

    it('只有 code 的舊列沒配到：該 code 進 lostCodes（依舊列順序）', () => {
        const existing = [
            { code: 'c1', start: 0 },
            { code: 'c2', start: 100 },
            { code: 'c3', start: 200 },
        ];
        const { rows, lostCodes } = mergeReplaceRows(existing, [row(0), row(150)]);
        expect(rows[0].code).toBe('c1');
        expect(rows[1].code).toBeUndefined();
        expect(lostCodes).toEqual(['c2', 'c3']);
    });

    it('只有 code 的舊列備註：新列沒寫備註時沿用', () => {
        const { rows } = mergeReplaceRows([{ code: 'c1', start: 0, note: '清唱' }], [row(0)]);
        expect(rows[0]).toMatchObject({ code: 'c1', note: '清唱' });
    });
});
