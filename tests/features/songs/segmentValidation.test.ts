import { describe, it, expect } from 'vitest';
import { validateSegments } from '../../../src/features/songs/lib/segmentValidation';

const codes = (issues: { index: number; code: string }[]) => issues.map((i) => `${i.index}:${i.code}`).sort();

describe('validateSegments', () => {
    it('結束早於開始報錯，缺結束與空歌名各自報錯', () => {
        expect(codes(validateSegments([{ start: 100, end: 100, title: 'A' }]))).toEqual(['0:end_before_start']);
        expect(codes(validateSegments([{ start: 100, end: 50, title: 'A' }]))).toEqual(['0:end_before_start']);
        expect(codes(validateSegments([{ start: 100, end: null, title: 'A' }]))).toEqual(['0:missing_end']);
        expect(codes(validateSegments([{ start: 0, end: 10, title: '   ' }]))).toEqual(['0:empty_title']);
    });

    it('片段重疊時兩列各報一筆 overlap，首尾相接不報', () => {
        const overlap = validateSegments([
            { start: 0, end: 100, title: 'A' },
            { start: 50, end: 150, title: 'B' },
        ]);
        expect(codes(overlap)).toEqual(['0:overlap', '1:overlap']);

        const touching = validateSegments([
            { start: 0, end: 100, title: 'A' },
            { start: 100, end: 200, title: 'B' },
        ]);
        expect(touching).toEqual([]);
    });

    it('一列同時與多列重疊也只報一次 overlap', () => {
        const issues = validateSegments([
            { start: 0, end: 300, title: 'A' },
            { start: 10, end: 20, title: 'B' },
            { start: 30, end: 40, title: 'C' },
        ]);
        expect(issues.filter((i) => i.index === 0 && i.code === 'overlap')).toHaveLength(1);
    });

    it('超過影片長度報錯，無 duration 不檢查', () => {
        const rows = [{ start: 200, end: 301, title: 'A' }];
        expect(codes(validateSegments(rows, { duration: 300 }))).toEqual(['0:exceeds_duration']);
        expect(validateSegments(rows)).toEqual([]);
        expect(validateSegments(rows, { duration: null })).toEqual([]);
        expect(validateSegments([{ start: 200, end: 300, title: 'A' }], { duration: 300 })).toEqual([]);
    });

    it('歌名或原唱超過 200 字報錯，剛好 200 字不報', () => {
        const long = 'x'.repeat(201);
        const ok = 'x'.repeat(200);
        expect(codes(validateSegments([{ start: 0, end: 10, title: long }]))).toEqual(['0:title_too_long']);
        expect(codes(validateSegments([{ start: 0, end: 10, title: 'A', artist: long }]))).toEqual(['0:artist_too_long']);
        expect(validateSegments([{ start: 0, end: 10, title: ok, artist: ok }])).toEqual([]);
        expect(validateSegments([{ start: 0, end: 10, title: 'A', artist: null }])).toEqual([]);
    });

    it('備註超過 30 字報 note_too_long，剛好 30 字、空白與 null 不報', () => {
        const row = (note: string | null | undefined) => [{ start: 0, end: 10, title: 'A', note }];
        expect(codes(validateSegments(row('x'.repeat(31))))).toEqual(['0:note_too_long']);
        expect(validateSegments(row('x'.repeat(30)))).toEqual([]);
        expect(validateSegments(row('練歌版'))).toEqual([]);
        expect(validateSegments(row(null))).toEqual([]);
        expect(validateSegments(row(undefined))).toEqual([]);
        expect(validateSegments(row(''))).toEqual([]);
    });

    it('備註以 trim 後的長度計算（前後空白不算）', () => {
        expect(validateSegments([{ start: 0, end: 10, title: 'A', note: `  ${'x'.repeat(30)}  ` }])).toEqual([]);
        expect(codes(validateSegments([{ start: 0, end: 10, title: 'A', note: `  ${'x'.repeat(31)}  ` }]))).toEqual(['0:note_too_long']);
    });
});
