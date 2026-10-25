import { describe, it, expect } from 'vitest';
import { parseTimeline } from '../../../src/features/songs/lib/timelineParser';

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
});
