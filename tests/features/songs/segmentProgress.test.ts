// 歌曲進度條純函式：目前播放時間換算已播／總長，拖曳位置換算成要 seek 的絕對秒數
import { describe, it, expect } from 'vitest';
import { segmentProgress, seekTarget } from '../../../src/features/songs/lib/segmentProgress';

describe('segmentProgress', () => {
    it('播放中回已播秒數與總長', () => {
        expect(segmentProgress(130, 100, 220)).toEqual({ elapsed: 30, total: 120 });
    });

    it('時間早於起點時已播夾在 0（不出現負數）', () => {
        expect(segmentProgress(90, 100, 220)).toEqual({ elapsed: 0, total: 120 });
    });

    it('時間超過終點時已播夾在總長（不超過 100%）', () => {
        expect(segmentProgress(500, 100, 220)).toEqual({ elapsed: 120, total: 120 });
    });

    it('end 不大於 start 時總長與已播都是 0', () => {
        expect(segmentProgress(150, 200, 200)).toEqual({ elapsed: 0, total: 0 });
        expect(segmentProgress(150, 200, 100)).toEqual({ elapsed: 0, total: 0 });
    });

    it('時間不是有限數（NaN、Infinity）時已播為 0、總長照算', () => {
        expect(segmentProgress(NaN, 100, 220)).toEqual({ elapsed: 0, total: 120 });
        expect(segmentProgress(Infinity, 100, 220)).toEqual({ elapsed: 0, total: 120 });
        expect(segmentProgress(-Infinity, 100, 220)).toEqual({ elapsed: 0, total: 120 });
    });
});

describe('seekTarget', () => {
    it('一般拖曳回 start + elapsed', () => {
        expect(seekTarget(100, 220, 30)).toBe(130);
    });

    it('拖到底時停在結束前 1 秒，避免立刻被判定結束', () => {
        expect(seekTarget(100, 220, 120)).toBe(219);
        expect(seekTarget(100, 220, 9999)).toBe(219);
    });

    it('elapsed 為負數時回 start', () => {
        expect(seekTarget(100, 220, -5)).toBe(100);
    });

    it('片段短於 1 秒或長度為 0 時一律回 start', () => {
        expect(seekTarget(100, 100, 0)).toBe(100);
        expect(seekTarget(100, 100, 5)).toBe(100);
        expect(seekTarget(100, 101, 1)).toBe(100);
        expect(seekTarget(100, 90, 3)).toBe(100);
    });

    it('elapsed 不是有限數時回 start', () => {
        expect(seekTarget(100, 220, NaN)).toBe(100);
        expect(seekTarget(100, 220, Infinity)).toBe(100);
    });
});
