import { describe, it, expect } from 'vitest';
import {
    createQueue,
    queueReducer,
    currentItem,
    type QueueItem,
    type QueueState,
} from '../../../src/features/songs/lib/queue';

// 每首不同影片，方便用 videoId 辨認
const mk = (n: number): QueueItem[] =>
    Array.from({ length: n }, (_, i) => ({ code: `code000${i}`, videoId: `video${i}`, start: i * 100, end: i * 100 + 90 }));

// 固定序列的亂數（LCG），讓隨機測試可重現
const seeded = (seed: number) => {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
};

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

describe('createQueue', () => {
    it('初始狀態：idle、cursor 指向 startIndex、playToken 0、order 為 0..n-1', () => {
        const s = createQueue(mk(3), { startIndex: 1 });
        expect(s.status).toBe('idle');
        expect(s.cursor).toBe(1);
        expect(s.playToken).toBe(0);
        expect(s.order).toEqual([0, 1, 2]);
        expect(s.repeat).toBe('off');
        expect(s.shuffle).toBe(false);
        expect(currentItem(s)?.videoId).toBe('video1');
    });
});

describe('queueReducer 播完與循環', () => {
    it('播完自動下一首：cursor 前進、playToken+1', () => {
        const s0 = createQueue(mk(3), { startIndex: 1, repeat: 'off' });
        const snapshot = JSON.stringify(s0);
        const s1 = queueReducer(s0, { type: 'ended' });
        expect(s1.cursor).toBe(2);
        expect(s1.playToken).toBe(s0.playToken + 1);
        expect(s1.status).toBe('playing');
        // reducer 不得改動傳入的 state
        expect(JSON.stringify(s0)).toBe(snapshot);
    });

    it('最後一首播完停止（repeat off）', () => {
        const s0 = createQueue(mk(3), { startIndex: 2, repeat: 'off' });
        const s1 = queueReducer(s0, { type: 'ended' });
        expect(s1.status).toBe('stopped');
        expect(s1.cursor).toBe(2);
    });

    it('全部循環繞回第一首', () => {
        const s0 = createQueue(mk(3), { startIndex: 2, repeat: 'all' });
        const s1 = queueReducer(s0, { type: 'ended' });
        expect(s1.cursor).toBe(0);
        expect(s1.status).toBe('playing');
        expect(s1.playToken).toBe(s0.playToken + 1);
    });

    it('單曲循環：ended 重播同首，手動 next 仍前進', () => {
        const s0 = createQueue(mk(3), { startIndex: 1, repeat: 'one' });
        const ended = queueReducer(s0, { type: 'ended' });
        expect(ended.cursor).toBe(1);
        expect(ended.playToken).toBe(s0.playToken + 1);
        expect(ended.status).toBe('playing');

        const next = queueReducer(s0, { type: 'next' });
        expect(next.cursor).toBe(2);
        expect(next.playToken).toBe(s0.playToken + 1);
    });

    it('只有一首且 repeat all：ended 仍從頭重播', () => {
        const s0 = createQueue(mk(1), { repeat: 'all' });
        const s1 = queueReducer(s0, { type: 'ended' });
        expect(s1.cursor).toBe(0);
        expect(s1.status).toBe('playing');
        expect(s1.playToken).toBe(s0.playToken + 1);
    });
});

describe('queueReducer 隨機', () => {
    it('開啟隨機保留目前這首：order[0] 是原目前項目、order 為排列、cursor 0、playToken 不變', () => {
        const s0 = createQueue(mk(5), { startIndex: 2 });
        const s1 = queueReducer(s0, { type: 'setShuffle', on: true, random: seeded(42) });
        expect(s1.shuffle).toBe(true);
        expect(s1.order[0]).toBe(2);
        expect(sorted(s1.order)).toEqual([0, 1, 2, 3, 4]);
        expect(s1.cursor).toBe(0);
        expect(s1.playToken).toBe(s0.playToken);
        expect(currentItem(s1)?.videoId).toBe('video2');
    });

    it('關閉隨機：order 還原、cursor 指向目前項目的原索引', () => {
        const on = queueReducer(createQueue(mk(5), { startIndex: 3 }), { type: 'setShuffle', on: true, random: seeded(7) });
        // 隨機中前進一首，記下目前項目
        const moved = queueReducer(on, { type: 'next' });
        const now = currentItem(moved)!;
        const off = queueReducer(moved, { type: 'setShuffle', on: false });
        expect(off.shuffle).toBe(false);
        expect(off.order).toEqual([0, 1, 2, 3, 4]);
        expect(currentItem(off)?.code).toBe(now.code);
        expect(off.playToken).toBe(moved.playToken);
    });

    it('隨機時上一首回到剛播的那首', () => {
        const on = queueReducer(createQueue(mk(5), { startIndex: 0 }), { type: 'setShuffle', on: true, random: seeded(1) });
        const s1 = queueReducer(on, { type: 'next' });
        const first = currentItem(s1)!;
        const s2 = queueReducer(s1, { type: 'next' });
        expect(currentItem(s2)?.code).not.toBe(first.code);
        const s3 = queueReducer(s2, { type: 'prev', elapsed: 0 });
        expect(currentItem(s3)?.code).toBe(first.code);
        expect(s3.cursor).toBe(1);
    });

    it('隨機 + 全部循環：繞回時重洗，新的第一首不等於剛播完那首', () => {
        for (let seed = 1; seed <= 20; seed++) {
            let s: QueueState = queueReducer(createQueue(mk(4), { repeat: 'all' }), {
                type: 'setShuffle',
                on: true,
                random: seeded(seed),
            });
            for (let i = 0; i < 3; i++) s = queueReducer(s, { type: 'next' });
            const lastPlayed = currentItem(s)!;
            const wrapped = queueReducer(s, { type: 'next', random: seeded(seed + 100) });
            expect(wrapped.cursor).toBe(0);
            expect(sorted(wrapped.order)).toEqual([0, 1, 2, 3]);
            expect(currentItem(wrapped)?.code, `seed ${seed}`).not.toBe(lastPlayed.code);
        }
    });
});

describe('queueReducer 上一首', () => {
    it('播超過 3 秒時上一首回到片頭：cursor 不變、playToken+1', () => {
        const s0 = createQueue(mk(3), { startIndex: 1 });
        const s1 = queueReducer(s0, { type: 'prev', elapsed: 5 });
        expect(s1.cursor).toBe(1);
        expect(s1.playToken).toBe(s0.playToken + 1);
    });

    it('3 秒內上一首退回前一首', () => {
        const s0 = createQueue(mk(3), { startIndex: 1 });
        const s1 = queueReducer(s0, { type: 'prev', elapsed: 1 });
        expect(s1.cursor).toBe(0);
        expect(s1.playToken).toBe(s0.playToken + 1);
    });

    it('第一首按上一首：repeat off 停在 0 並重播，repeat all 繞到最後', () => {
        const off = queueReducer(createQueue(mk(3), { repeat: 'off' }), { type: 'prev', elapsed: 0 });
        expect(off.cursor).toBe(0);
        expect(off.playToken).toBe(1);

        const all = queueReducer(createQueue(mk(3), { repeat: 'all' }), { type: 'prev', elapsed: 0 });
        expect(all.cursor).toBe(2);
        expect(all.playToken).toBe(1);
    });
});

describe('queueReducer 錯誤處理', () => {
    it('錯誤自動跳過整支影片：同 videoId 的後續項目一併跳過', () => {
        const items: QueueItem[] = [
            { code: 'code0001', videoId: 'AAAAAAAAAAA', start: 0, end: 10 },
            { code: 'code0002', videoId: 'AAAAAAAAAAA', start: 10, end: 20 },
            { code: 'code0003', videoId: 'BBBBBBBBBBB', start: 0, end: 10 },
        ];
        const s0 = createQueue(items);
        const s1 = queueReducer(s0, { type: 'error' });
        expect(s1.unplayable).toContain('AAAAAAAAAAA');
        expect(currentItem(s1)?.code).toBe('code0003');
        expect(s1.cursor).toBe(2);
        expect(s1.status).toBe('playing');
        expect(s1.allFailed).toBe(false);
    });

    it('全部不可播時停止並標記 allFailed', () => {
        const s0 = createQueue(mk(2));
        const s1 = queueReducer(s0, { type: 'error' });
        expect(s1.status).toBe('playing');
        const s2 = queueReducer(s1, { type: 'error' });
        expect(s2.status).toBe('stopped');
        expect(s2.allFailed).toBe(true);
        expect(s2.unplayable).toHaveLength(2);
    });

    it('next 會跳過已標記不可播的影片', () => {
        const items: QueueItem[] = [
            { code: 'code0001', videoId: 'AAAAAAAAAAA', start: 0, end: 10 },
            { code: 'code0002', videoId: 'BBBBBBBBBBB', start: 0, end: 10 },
            { code: 'code0003', videoId: 'CCCCCCCCCCC', start: 0, end: 10 },
        ];
        const s0: QueueState = { ...createQueue(items), unplayable: ['BBBBBBBBBBB'] };
        const s1 = queueReducer(s0, { type: 'next' });
        expect(currentItem(s1)?.code).toBe('code0003');
    });
});

describe('queueReducer 其他動作', () => {
    it('jump 跳到 order 位置並 playToken+1', () => {
        const s1 = queueReducer(createQueue(mk(4)), { type: 'jump', index: 3 });
        expect(s1.cursor).toBe(3);
        expect(s1.status).toBe('playing');
        expect(s1.playToken).toBe(1);
    });

    it('setRepeat 只改 repeat', () => {
        const s0 = createQueue(mk(3), { startIndex: 1 });
        const s1 = queueReducer(s0, { type: 'setRepeat', mode: 'all' });
        expect(s1.repeat).toBe('all');
        expect(s1.cursor).toBe(1);
        expect(s1.playToken).toBe(s0.playToken);
        expect(s1.status).toBe(s0.status);
    });
});

describe('queueReducer 隨機循環重洗（review 修正）', () => {
    it('隨機全部循環重洗後上一首回到剛播完那首', () => {
        for (let seed = 1; seed <= 20; seed++) {
            let s: QueueState = queueReducer(createQueue(mk(3), { repeat: 'all' }), {
                type: 'setShuffle',
                on: true,
                random: seeded(seed),
            });
            s = queueReducer(s, { type: 'next' });
            s = queueReducer(s, { type: 'next' });
            const lastPlayed = currentItem(s)!;
            const wrapped = queueReducer(s, { type: 'ended', random: seeded(seed + 50) });
            expect(wrapped.cursor).toBe(0);
            const back = queueReducer(wrapped, { type: 'prev', elapsed: 0 });
            expect(currentItem(back)?.code, `seed ${seed}`).toBe(lastPlayed.code);
        }
    });

    it('error 繞回重洗時使用注入的 random（同一 seed 結果相同）', () => {
        const run = (seed: number) => {
            let s: QueueState = queueReducer(createQueue(mk(6), { repeat: 'all' }), {
                type: 'setShuffle',
                on: true,
                random: seeded(99),
            });
            for (let i = 0; i < 5; i++) s = queueReducer(s, { type: 'next' });
            return queueReducer(s, { type: 'error', random: seeded(seed) }).order;
        };
        for (let seed = 1; seed <= 5; seed++) {
            expect(run(seed), `seed ${seed}`).toEqual(run(seed));
        }
    });
});
