import { describe, it, expect } from 'vitest';
import { parseTimeline, parseTimelineDetailed } from '../../../src/features/songs/lib/timelineParser';

describe('parseTimeline', () => {
    it('時間軸文字拆成多首', () => {
        const rows = parseTimeline('0:00 歌A / 原唱A\n3:30 歌B / 原唱B\n7:45 歌C / 原唱C');
        expect(rows).toHaveLength(3);
        expect(rows.map((r) => r.start)).toEqual([0, 210, 465]);
        expect(rows.map((r) => r.title)).toEqual(['歌A', '歌B', '歌C']);
        expect(rows.map((r) => r.artist)).toEqual(['原唱A', '原唱B', '原唱C']);
    });

    it('支援 " - " 與 " by " 分隔，無分隔時 artist 為 null', () => {
        const rows = parseTimeline('0:00 Song A - Artist A\n1:00 Song B BY Artist B\n2:00 只有歌名');
        expect(rows[0]).toMatchObject({ title: 'Song A', artist: 'Artist A' });
        expect(rows[1]).toMatchObject({ title: 'Song B', artist: 'Artist B' });
        expect(rows[2]).toMatchObject({ title: '只有歌名', artist: null });
    });

    it('歌名中的連字號（前後無空白）不被當成分隔符', () => {
        const rows = parseTimeline('0:00 Spider-Man');
        expect(rows[0]).toMatchObject({ title: 'Spider-Man', artist: null });
    });

    it('缺結束時間取下一首開始，最後一列 end 為 null', () => {
        const rows = parseTimeline('0:00 A\n3:30 B\n7:45 C');
        expect(rows[0].end).toBe(210);
        expect(rows[1].end).toBe(465);
        expect(rows[2].end).toBeNull();
    });

    it('全形符號與編號正規化', () => {
        const [full] = parseTimeline('０１．１２：３４ 歌名／原唱');
        expect(full).toMatchObject({ start: 754, title: '歌名', artist: '原唱' });

        const rows = parseTimeline('#2 13:00 X\n3) 14:00 Y');
        expect(rows[0]).toMatchObject({ start: 780, title: 'X' });
        expect(rows[1]).toMatchObject({ start: 840, title: 'Y' });
    });

    it('區間寫法取兩端', () => {
        const [a] = parseTimeline('12:34-15:00 歌名');
        expect(a).toMatchObject({ start: 754, end: 900, title: '歌名' });
        const [b] = parseTimeline('12:34 ~ 15:00 歌名');
        expect(b).toMatchObject({ start: 754, end: 900, title: '歌名' });
    });

    it('沒時間的行略過，line 為原始 0-based 行號', () => {
        const rows = parseTimeline('【歌單】\n\n0:00 A\n\n3:00 B');
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.line)).toEqual([2, 4]);
        expect(rows.map((r) => r.title)).toEqual(['A', 'B']);
    });

    it('時間後接 - 歌名時去掉前導破折號', () => {
        expect(parseTimeline('00:00 - Opening')[0]).toMatchObject({ title: 'Opening', artist: null });
        expect(parseTimeline('12:34 - Song / Artist')[0]).toMatchObject({ title: 'Song', artist: 'Artist' });
        expect(parseTimeline('12:34 – Song')[0]).toMatchObject({ title: 'Song', artist: null });
    });

    it('歌名本身以 - 開頭時保留，分隔符後有空白才剝掉', () => {
        expect(parseTimeline('00:00 -ERROR-')[0]).toMatchObject({ title: '-ERROR-', artist: null });
        expect(parseTimeline('00:00 - Opening')[0]).toMatchObject({ title: 'Opening', artist: null });
        expect(parseTimeline('00:00 | Song')[0]).toMatchObject({ title: 'Song', artist: null });
        expect(parseTimeline('00:00 —Song')[0]).toMatchObject({ title: '—Song', artist: null });
    });

    it('支援〜區間與括號包住的時間', () => {
        expect(parseTimeline('17:00〜18:00 歌')[0]).toMatchObject({ start: 1020, end: 1080, title: '歌' });
        for (const line of ['[19:00] 歌2', '(19:00) 歌2', '【19:00】歌2']) {
            expect(parseTimeline(line)[0], line).toMatchObject({ start: 1140, title: '歌2' });
        }
    });

    it('看似時間卻解析失敗的行回報在 unparsed', () => {
        const text = '00:10 A\n中間 12:34 不在行首\n12:34-12:75 壞區間\n20:00 B';
        const { rows, unparsed } = parseTimelineDetailed(text);
        expect(rows.map((r) => r.title)).toEqual(['A', 'B']);
        expect(rows[0].end).toBe(1200);
        expect(unparsed).toEqual([1, 2]);
        // parseTimeline 仍等於 .rows
        expect(parseTimeline(text)).toEqual(rows);
    });

    it('純文字標題行與空行不進 unparsed', () => {
        const { rows, unparsed } = parseTimelineDetailed('【歌單】\n\n00:10 A\n感謝收看');
        expect(rows).toHaveLength(1);
        expect(unparsed).toEqual([]);
    });
});
