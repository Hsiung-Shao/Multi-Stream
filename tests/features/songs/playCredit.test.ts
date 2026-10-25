import { describe, it, expect } from 'vitest';
import {
    playThreshold,
    accumulate,
    dedupeRecent,
    PLAY_THRESHOLD_MAX_SECONDS,
    MAX_TICK_SECONDS,
    DEDUPE_WINDOW_MS,
} from '../../../src/features/songs/lib/playCredit';

describe('playCredit 常數', () => {
    it('門檻上限 30 秒、單次累計上限 1.5 秒、去重視窗 30 分鐘', () => {
        expect(PLAY_THRESHOLD_MAX_SECONDS).toBe(30);
        expect(MAX_TICK_SECONDS).toBe(1.5);
        expect(DEDUPE_WINDOW_MS).toBe(30 * 60_000);
    });
});

describe('playThreshold', () => {
    it('計次門檻取 30 秒與一半長度的較小者', () => {
        expect(playThreshold(0, 20)).toBe(10);
        expect(playThreshold(0, 200)).toBe(30);
        expect(playThreshold(100, 160)).toBe(30);
        expect(playThreshold(100, 140)).toBe(20);
    });
});

describe('accumulate', () => {
    it('沒在播放時不累計', () => {
        expect(accumulate(10, 60_000, false)).toBe(10);
    });

    it('每次最多加 1.5 秒（分頁凍結後的長間隔不會一次灌滿）', () => {
        expect(accumulate(10, 60_000, true)).toBe(11.5);
    });

    it('正常輪詢間隔 250ms 加 0.25 秒', () => {
        expect(accumulate(10, 250, true)).toBeCloseTo(10.25, 10);
    });

    it('deltaMs 為 0 或負數時維持原值', () => {
        expect(accumulate(10, 0, true)).toBe(10);
        expect(accumulate(10, -500, true)).toBe(10);
    });
});

describe('dedupeRecent', () => {
    const NOW = 1_000_000_000_000;
    const MIN = 60_000;

    it('30 分鐘內看過的濾掉，超過的保留，結果去重保序', () => {
        const seen = { aaaaaaaa: NOW - 10 * MIN, bbbbbbbb: NOW - 40 * MIN };
        const out = dedupeRecent(['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'bbbbbbbb'], seen, NOW);
        expect(out).toEqual(['bbbbbbbb', 'cccccccc']);
    });

    it('剛好滿 30 分鐘視為已過期可再計；不修改 seen；可自訂視窗', () => {
        const seen = { aaaaaaaa: NOW - 30 * MIN };
        const copy = { ...seen };
        expect(dedupeRecent(['aaaaaaaa'], seen, NOW)).toEqual(['aaaaaaaa']);
        expect(seen).toEqual(copy);
        expect(dedupeRecent(['aaaaaaaa'], seen, NOW, 31 * MIN)).toEqual([]);
    });
});
