import { describe, it, expect } from 'vitest';
import { mergePrefill } from '../../../src/features/songs/lib/streamPrefill';

const FOUND = { title: '週表標題', vtuberId: 'vt-1', streamedAt: '2026-10-01T12:00:00Z' };

describe('mergePrefill', () => {
    it('後台自動帶入不覆蓋手填欄位：title 已填 → 只補 vtuberId 與 streamedAt', () => {
        const out = mergePrefill({ title: '我自己填的', vtuberId: null, streamedAt: null }, FOUND);
        expect(out).toEqual({ title: '我自己填的', vtuberId: 'vt-1', streamedAt: '2026-10-01T12:00:00Z' });
    });

    it('空欄位（空字串、只有空白、空字串 id）才補', () => {
        const out = mergePrefill({ title: '   ', vtuberId: '', streamedAt: '' }, FOUND);
        expect(out).toEqual(FOUND);
    });

    it('已填的 vtuberId 與 streamedAt 不被覆蓋', () => {
        const cur = { title: '', vtuberId: 'mine', streamedAt: '2026-01-01T00:00:00Z' };
        expect(mergePrefill(cur, FOUND)).toEqual({ title: '週表標題', vtuberId: 'mine', streamedAt: '2026-01-01T00:00:00Z' });
    });

    it('found 的欄位為空時不蓋掉現值', () => {
        const cur = { title: '', vtuberId: null, streamedAt: null };
        expect(mergePrefill(cur, { title: null, vtuberId: null, streamedAt: '2026-10-01T12:00:00Z' })).toEqual({
            title: '',
            vtuberId: null,
            streamedAt: '2026-10-01T12:00:00Z',
        });
    });

    it('found 為 null 回原值複本（不是同一個物件）', () => {
        const cur = { title: 'x', vtuberId: null, streamedAt: null };
        const out = mergePrefill(cur, null);
        expect(out).toEqual(cur);
        expect(out).not.toBe(cur);
    });
});
