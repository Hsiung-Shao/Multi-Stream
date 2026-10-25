import { describe, it, expect } from 'vitest';
import { parseTimecode, formatTimecode } from '../../../src/features/songs/lib/timecode';

describe('timecode', () => {
    it('時間字串各格式轉秒數', () => {
        // 純秒數、m:ss、h:mm:ss、1h2m3s 都要算對（常見 bug：小時段被當成分鐘）
        expect(parseTimecode('754')).toBe(754);
        expect(parseTimecode('12:34')).toBe(754);
        expect(parseTimecode('1:02:03')).toBe(3723);
        expect(parseTimecode('1h2m3s')).toBe(3723);
        expect(parseTimecode('2m3s')).toBe(123);
        expect(parseTimecode('45s')).toBe(45);
        expect(parseTimecode('  12:34  ')).toBe(754);
    });

    it('非法時間字串回 null', () => {
        for (const bad of ['12:75', 'abc', '', '-5', '1:2:3']) {
            expect(parseTimecode(bad), `輸入 ${JSON.stringify(bad)}`).toBeNull();
        }
    });

    it('秒數格式化為 m:ss 或 h:mm:ss', () => {
        expect(formatTimecode(754)).toBe('12:34');
        expect(formatTimecode(3723)).toBe('1:02:03');
        expect(formatTimecode(5)).toBe('0:05');
    });
});
