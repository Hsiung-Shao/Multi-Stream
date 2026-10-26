// 單場歌回時間軸：片段之間的空檔算聊天，以及歌曲總長／影片跨度
import { describe, it, expect } from 'vitest';
import { videoTimeline, songsDuration, videoSpan } from '../../../src/features/songs/lib/videoTimeline';

describe('videoTimeline', () => {
    it('片段之間有空檔時插入聊天段，offset 與 width 是佔整個範圍的比例', () => {
        const t = videoTimeline([
            { code: 'a', start: 100, end: 200 },
            { code: 'b', start: 300, end: 400 },
        ]);
        expect(t.start).toBe(100);
        expect(t.end).toBe(400);
        expect(t.parts.map((p) => p.kind)).toEqual(['song', 'chat', 'song']);
        expect(t.parts.map((p) => [p.start, p.end])).toEqual([[100, 200], [200, 300], [300, 400]]);
        expect(t.parts[0].offset).toBeCloseTo(0);
        expect(t.parts[0].width).toBeCloseTo(1 / 3);
        expect(t.parts[1].offset).toBeCloseTo(1 / 3);
        expect(t.parts[1].width).toBeCloseTo(1 / 3);
        expect(t.parts[2].offset).toBeCloseTo(2 / 3);
        expect(t.parts[2].width).toBeCloseTo(1 / 3);
        expect(t.parts[0].code).toBe('a');
        expect(t.parts[2].code).toBe('b');
        expect(t.parts[1].code).toBeUndefined();
    });

    it('相鄰的片段（前一段結束＝後一段開始）之間不插入聊天段', () => {
        const t = videoTimeline([
            { code: 'a', start: 0, end: 100 },
            { code: 'b', start: 100, end: 200 },
        ]);
        expect(t.parts.map((p) => p.kind)).toEqual(['song', 'song']);
        expect(t.parts.every((p) => p.width > 0)).toBe(true);
    });

    it('重疊的片段把前一段的結束截到後一段開始，也不插入聊天段', () => {
        const t = videoTimeline([
            { code: 'a', start: 0, end: 100 },
            { code: 'b', start: 80, end: 200 },
        ]);
        expect(t.parts.map((p) => p.kind)).toEqual(['song', 'song']);
        expect(t.parts[0]).toMatchObject({ start: 0, end: 80 });
        expect(t.parts[1]).toMatchObject({ start: 80, end: 200 });
        expect(t.end).toBe(200);
    });

    it('輸入未排序時依 start 排序，且不修改輸入陣列', () => {
        const input = [
            { code: 'b', start: 300, end: 400 },
            { code: 'a', start: 100, end: 200 },
        ];
        const t = videoTimeline(input);
        expect(t.parts.filter((p) => p.kind === 'song').map((p) => p.code)).toEqual(['a', 'b']);
        expect(input.map((s) => s.code)).toEqual(['b', 'a']);
    });

    it('所有段的寬度都大於 0，且總和為 1', () => {
        const t = videoTimeline([
            { start: 0, end: 50 },
            { start: 50, end: 120 },
            { start: 200, end: 260 },
            { start: 250, end: 300 },
        ]);
        expect(t.parts.every((p) => p.width > 0)).toBe(true);
        expect(t.parts.reduce((sum, p) => sum + p.width, 0)).toBeCloseTo(1);
    });

    it('空陣列回傳 start、end 為 0 且沒有任何段', () => {
        expect(videoTimeline([])).toEqual({ start: 0, end: 0, parts: [] });
    });
});

describe('songsDuration 與 videoSpan', () => {
    const segs = [
        { start: 0, end: 100 },
        { start: 200, end: 250 },
        { start: 400, end: 500 },
    ];

    it('歌曲總長是各片段長度加總，跨度是最晚結束減最早開始', () => {
        expect(songsDuration(segs)).toBe(250);
        expect(videoSpan(segs)).toBe(500);
    });

    it('輸入順序不影響跨度', () => {
        expect(videoSpan([...segs].reverse())).toBe(500);
    });

    it('空陣列時兩者都是 0', () => {
        expect(songsDuration([])).toBe(0);
        expect(videoSpan([])).toBe(0);
    });
});
