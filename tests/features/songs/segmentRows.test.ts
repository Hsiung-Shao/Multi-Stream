// L9：片段列資料模型的版本備註（note）與「取代並對回舊片段」時保留舊備註
import { describe, it, expect } from 'vitest';
import { emptyRow, fromImported, computeRowIssues, type ImportedRow, type SegmentRowDraft } from '../../../src/features/songs/components/segmentRows';
import { mergeReplaceRows } from '../../../src/features/songs/lib/timelineMerge';

const imported = (over: Partial<ImportedRow> = {}): ImportedRow => ({
    start: 10, end: 180, title: '歌A', artist: '原唱A', line: 0, endEstimated: false, ...over,
});

describe('emptyRow／fromImported 的 note', () => {
    it('新的空白列 note 是空字串', () => {
        expect(emptyRow().note).toBe('');
        expect(emptyRow('1:00').note).toBe('');
    });

    it('匯入列帶 note 時原樣帶進草稿列', () => {
        expect(fromImported(imported({ note: '清唱' })).note).toBe('清唱');
    });

    it('匯入列沒有 note（缺欄或 null）時給空字串，不是 undefined', () => {
        expect(fromImported(imported()).note).toBe('');
        expect(fromImported(imported({ note: null })).note).toBe('');
    });

    it('帶 note 不影響其他欄位的轉換', () => {
        expect(fromImported(imported({ id: 'i1', code: 'c1', note: '合唱' }))).toMatchObject({
            id: 'i1', code: 'c1', start: '0:10', end: '3:00', title: '歌A', artist: '原唱A', note: '合唱',
        });
    });
});

describe('computeRowIssues 對 note 的驗證', () => {
    const row = (note: string): SegmentRowDraft => ({ ...emptyRow('0:00'), end: '3:00', title: '歌A', note });

    it('備註 trim 後超過 30 字，該列回報 note_too_long', () => {
        expect(computeRowIssues([row('字'.repeat(31))], 600).get(0)).toContain('note_too_long');
    });

    it('備註剛好 30 字、或前後空白撐到 31 字但 trim 後 30 字，都不報錯', () => {
        expect(computeRowIssues([row('字'.repeat(30))], 600).get(0)).toBeUndefined();
        expect(computeRowIssues([row(` ${'字'.repeat(30)} `)], 600).get(0)).toBeUndefined();
    });
});

describe('mergeReplaceRows 保留舊備註', () => {
    const incoming = (start: number, extra: Record<string, unknown> = {}) => ({ start, end: null, title: `歌${start}`, artist: null, line: 0, ...extra });

    it('新匯入的列沒有備註時，沿用配到的舊片段備註', () => {
        const { rows } = mergeReplaceRows([{ id: 'i1', code: 'c1', start: 10, note: '清唱' }], [incoming(10)]);
        expect(rows[0]).toMatchObject({ id: 'i1', code: 'c1', note: '清唱' });
    });

    it('新匯入的列有備註時，用新的蓋掉舊的', () => {
        const { rows } = mergeReplaceRows([{ id: 'i1', code: 'c1', start: 10, note: '清唱' }], [incoming(10, { note: '合唱' })]);
        expect(rows[0].note).toBe('合唱');
    });

    it('各列各自對回自己的舊備註，沒配到的新列不會撿到別人的備註', () => {
        const existing = [
            { id: 'i1', code: 'c1', start: 10, note: '清唱' },
            { id: 'i2', code: 'c2', start: 100, note: '練歌版' },
        ];
        const { rows } = mergeReplaceRows(existing, [incoming(10), incoming(100), incoming(300)]);
        expect(rows.map((r) => r.note ?? '')).toEqual(['清唱', '練歌版', '']);
    });

    it('舊片段沒有備註、新列也沒有：結果沒有備註', () => {
        const { rows } = mergeReplaceRows([{ id: 'i1', code: 'c1', start: 10 }], [incoming(10)]);
        expect(rows[0].note ?? '').toBe('');
    });

    it('備註保留不改變原本的 id／code 配對與 lostCodes', () => {
        const { rows, lostCodes } = mergeReplaceRows(
            [{ id: 'i1', code: 'c1', start: 10, note: '清唱' }, { id: 'i2', code: 'c2', start: 50, note: '合唱' }],
            [incoming(10)],
        );
        expect(rows[0]).toMatchObject({ id: 'i1', code: 'c1' });
        expect(lostCodes).toEqual(['c2']);
    });
});

// ---- prepareImport 依歌曲長度估計結束 ----
import { prepareImport } from '../../../src/features/songs/components/segmentRows';
import { parseTimelineDetailed } from '../../../src/features/songs/lib/timelineParser';

describe('prepareImport 依歌曲長度', () => {
    const parse = (text: string) => parseTimelineDetailed(text).rows;

    it('E8 單曲影片仍以片長為結束，即使有長度也不用', () => {
        const text = '0:00 歌A';
        const parsed = parse(text);
        const lengths = new Map([[parsed[0].line, 200]]);
        const rows = prepareImport(parsed, text.split('\n'), 300, lengths);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ end: 300, endFromLength: false });
    });

    it('E8b 依行號套用長度並標示 endFromLength', () => {
        const text = '0:00 歌A\n3:00 歌B';
        const parsed = parse(text);
        const lengths = new Map([[parsed[0].line, 100]]);
        const rows = prepareImport(parsed, text.split('\n'), 10000, lengths);
        expect(rows[0]).toMatchObject({ end: 110, endEstimated: true, endFromLength: true });
        expect(rows[1]).toMatchObject({ end: 450, endFromLength: false });
    });

    it('E8c 不傳 lengths 時行為不變且 endFromLength 為 false', () => {
        const text = '0:00 歌A\n10:00 歌B';
        const rows = prepareImport(parse(text), text.split('\n'), 10000);
        expect(rows[0]).toMatchObject({ end: 270, endFromLength: false });
    });
});
