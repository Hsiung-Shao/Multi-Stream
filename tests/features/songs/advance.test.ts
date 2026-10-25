import { describe, it, expect } from 'vitest';
import { shouldAdvance, planLoad, END_EPSILON } from '../../../src/features/songs/lib/advance';
import type { QueueItem } from '../../../src/features/songs/lib/queue';

const item = (videoId: string, start = 0, end = 100): QueueItem => ({ code: `c${videoId}`, videoId, start, end });

describe('advance', () => {
    it('到達結束點判斷切歌', () => {
        expect(END_EPSILON).toBe(0.25);
        expect(shouldAdvance(100 - 0.2, 100)).toBe(true);
        expect(shouldAdvance(100, 100)).toBe(true);
        expect(shouldAdvance(100 - 1, 100)).toBe(false);
    });

    it('同影片下一首用 seek，不同影片或沒有上一首用 load', () => {
        expect(planLoad(item('A', 0, 100), item('A', 100, 200))).toBe('seek');
        expect(planLoad(item('A'), item('B'))).toBe('load');
        expect(planLoad(null, item('A'))).toBe('load');
    });
});
