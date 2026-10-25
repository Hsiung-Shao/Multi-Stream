import { describe, it, expect, vi } from 'vitest';
import { createPlayReporter } from '../../../src/features/songs/playReporter';

const MIN = 60_000;
const memoryStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const code = (i: number) => `c${String(i).padStart(7, '0')}`;

describe('createPlayReporter', () => {
    it('同 code 記兩次，flush 只送 1 個', () => {
        const send = vi.fn();
        const r = createPlayReporter({ send, now: () => 1_000_000, storage: memoryStorage() });
        r.record('abcd1234');
        r.record('abcd1234');
        r.flush();
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith(['abcd1234']);
        // flush 後清空：再 flush 不重送
        r.flush();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('沒有待送項目時 flush 不呼叫 send', () => {
        const send = vi.fn();
        createPlayReporter({ send, now: () => 0, storage: memoryStorage() }).flush();
        expect(send).not.toHaveBeenCalled();
    });

    it('30 分鐘內（含重新整理後的新 reporter）同 code 不再送，滿 30 分鐘後可再送', () => {
        const storage = memoryStorage();
        let t = 1_000_000;
        const send1 = vi.fn();
        const r1 = createPlayReporter({ send: send1, now: () => t, storage });
        r1.record('abcd1234');
        r1.flush();
        expect(send1).toHaveBeenCalledTimes(1);

        t += 10 * MIN;
        const send2 = vi.fn();
        const r2 = createPlayReporter({ send: send2, now: () => t, storage });
        r2.record('abcd1234');
        r2.flush();
        expect(send2).not.toHaveBeenCalled();

        t += 31 * MIN;
        r2.record('abcd1234');
        r2.flush();
        expect(send2).toHaveBeenCalledWith(['abcd1234']);
    });

    it('25 個不同 code：flush 分兩批（20＋5），依記錄順序', () => {
        const send = vi.fn();
        const r = createPlayReporter({ send, now: () => 1_000_000, storage: memoryStorage() });
        for (let i = 0; i < 25; i++) r.record(code(i));
        r.flush();
        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[0][0]).toHaveLength(20);
        expect(send.mock.calls[1][0]).toHaveLength(5);
        expect(send.mock.calls[0][0][0]).toBe(code(0));
        expect(send.mock.calls[1][0][0]).toBe(code(20));
    });
});
