import { describe, it, expect } from 'vitest';
import { estimateEnds, END_ESTIMATE_MAX_SECONDS, SINGLE_SONG_MAX_SECONDS, isSingleSongVideo } from '../../../src/features/songs/lib/endEstimate';

const row = (start: number, end: number | null = null, title = `歌${start}`) => ({ start, end, title });

describe('estimateEnds', () => {
    it('常數：單首最長估 270 秒（4 分 30 秒）', () => {
        expect(END_ESTIMATE_MAX_SECONDS).toBe(270);
    });

    it('結束時間估計取三者最早：下一首很遠時以 start+270 封頂', () => {
        const out = estimateEnds([row(0), row(780)], { duration: 10000 });
        expect(out[0]).toMatchObject({ end: 270, endEstimated: true });
    });

    it('下一首更近時用下一首開始', () => {
        const out = estimateEnds([row(0), row(240)], { duration: 10000 });
        expect(out[0]).toMatchObject({ end: 240, endEstimated: true });
    });

    it('最後一首用影片長度封頂；沒有 duration 則 start+270', () => {
        expect(estimateEnds([row(9900)], { duration: 10000 })[0]).toMatchObject({ end: 10000, endEstimated: true });
        expect(estimateEnds([row(9900)])[0]).toMatchObject({ end: 10170, endEstimated: true });
        expect(estimateEnds([row(9900)], { duration: null })[0].end).toBe(10170);
        // duration 不大於 start 時不採用
        expect(estimateEnds([row(9900)], { duration: 9900 })[0].end).toBe(10170);
    });

    it('明確結束時間不覆蓋，endEstimated 為 false；不修改傳入陣列', () => {
        const input = [row(0, 100), row(200)];
        const snapshot = JSON.stringify(input);
        const out = estimateEnds(input, { duration: 10000 });
        expect(out[0]).toMatchObject({ end: 100, endEstimated: false });
        expect(out[1]).toMatchObject({ end: 470, endEstimated: true });
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

describe('estimateEnds 新上限與單曲例外常數', () => {
    it('E1 沒寫結束時以開始後 4 分 30 秒封頂', () => {
        const out = estimateEnds([row(100), row(2000)], { duration: 10000 });
        expect(out[0]).toMatchObject({ end: 370, endEstimated: true });
    });

    it('常數：單曲影片長度上限為 600 秒', () => {
        expect(SINGLE_SONG_MAX_SECONDS).toBe(600);
    });
});

describe('isSingleSongVideo', () => {
    it('E3b 影片長度正數且 ≤ 600、只有 1 首時為真（600 含邊界）', () => {
        expect(isSingleSongVideo(600, 1)).toBe(true);
        expect(isSingleSongVideo(240, 1)).toBe(true);
    });

    it('E3b 影片超過 600 秒時為假', () => {
        expect(isSingleSongVideo(601, 1)).toBe(false);
    });

    it('E3b 影片雖短但有 2 首以上時為假', () => {
        expect(isSingleSongVideo(300, 2)).toBe(false);
    });

    it('E3b 影片長度為 null、undefined 或 0 時為假', () => {
        expect(isSingleSongVideo(null, 1)).toBe(false);
        expect(isSingleSongVideo(undefined, 1)).toBe(false);
        expect(isSingleSongVideo(0, 1)).toBe(false);
    });
});
