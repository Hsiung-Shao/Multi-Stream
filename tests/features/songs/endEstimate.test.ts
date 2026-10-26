import { describe, it, expect } from 'vitest';
import { estimateEnds, END_ESTIMATE_MAX_SECONDS } from '../../../src/features/songs/lib/endEstimate';

const row = (start: number, end: number | null = null, title = `歌${start}`) => ({ start, end, title });

describe('estimateEnds', () => {
    it('常數：單首最長估 360 秒', () => {
        expect(END_ESTIMATE_MAX_SECONDS).toBe(360);
    });

    it('結束時間估計取三者最早：下一首很遠時以 start+360 封頂', () => {
        const out = estimateEnds([row(0), row(780)], { duration: 10000 });
        expect(out[0]).toMatchObject({ end: 360, endEstimated: true });
    });

    it('下一首更近時用下一首開始', () => {
        const out = estimateEnds([row(0), row(240)], { duration: 10000 });
        expect(out[0]).toMatchObject({ end: 240, endEstimated: true });
    });

    it('最後一首用影片長度封頂；沒有 duration 則 start+360', () => {
        expect(estimateEnds([row(9900)], { duration: 10000 })[0]).toMatchObject({ end: 10000, endEstimated: true });
        expect(estimateEnds([row(9900)])[0]).toMatchObject({ end: 10260, endEstimated: true });
        expect(estimateEnds([row(9900)], { duration: null })[0].end).toBe(10260);
        // duration 不大於 start 時不採用
        expect(estimateEnds([row(9900)], { duration: 9900 })[0].end).toBe(10260);
    });

    it('明確結束時間不覆蓋，endEstimated 為 false；不修改傳入陣列', () => {
        const input = [row(0, 100), row(200)];
        const snapshot = JSON.stringify(input);
        const out = estimateEnds(input, { duration: 10000 });
        expect(out[0]).toMatchObject({ end: 100, endEstimated: false });
        expect(out[1]).toMatchObject({ end: 560, endEstimated: true });
        expect(JSON.stringify(input)).toBe(snapshot);
        expect(out[0]).not.toBe(input[0]);
    });

    it('下一首取「所有列中 start 更大的最小值」，不依賴輸入順序；同 start 不算下一首', () => {
        const out = estimateEnds([row(780), row(0), row(0, null, '同開始'), row(100)]);
        // start 0 的兩列都以 100 為下一首
        expect(out.filter((r) => r.start === 0).map((r) => r.end)).toEqual([100, 100]);
        // 保留原順序與其他欄位
        expect(out.map((r) => r.start)).toEqual([780, 0, 0, 100]);
        expect(out[2].title).toBe('同開始');
    });

    it('可自訂 maxSeconds', () => {
        const out = estimateEnds([row(0)], { maxSeconds: 90 });
        expect(out[0].end).toBe(90);
    });
});
