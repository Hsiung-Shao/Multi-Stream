// 公開頁回報日期：'YYYY-MM-DD' 在任何時區都顯示同一天（負時區最容易被推前一天，CI 多半是 UTC 抓不到，所以這裡強制切時區）
import { describe, it, expect, afterEach } from 'vitest';
import { formatPublicDate } from '../../../src/features/status/formatPublicDate';

const ORIGINAL_TZ = process.env.TZ;

/** 切換本地時區（Node 會在 TZ 改變時重設 Date 與 Intl 的預設時區）並確認真的生效 */
function useTimeZone(tz: string, expectedOffsetSign: 1 | -1) {
    process.env.TZ = tz;
    // getTimezoneOffset 是「UTC − 本地」分鐘數：負時區（美洲）為正、正時區（亞洲）為負
    const offset = new Date(2026, 9, 8, 12).getTimezoneOffset();
    expect(Math.sign(offset)).toBe(expectedOffsetSign);
}

afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
});

describe('formatPublicDate', () => {
    it('負時區（America/Los_Angeles）：不會被推到前一天', () => {
        useTimeZone('America/Los_Angeles', 1);
        // 對照組：直接 new Date('YYYY-MM-DD') 會被當 UTC 午夜，在這個時區變成 10/7（證明這個測試能抓到回歸）
        expect(new Intl.DateTimeFormat('en-US').format(new Date('2026-10-08'))).toBe('10/7/2026');
        expect(formatPublicDate('2026-10-08', 'en-US')).toBe('10/8/2026');
        expect(formatPublicDate('2026-01-01', 'en-US')).toBe('1/1/2026');
    });

    it('正時區（Asia/Taipei、Pacific/Kiritimati）：同一天', () => {
        useTimeZone('Asia/Taipei', -1);
        expect(formatPublicDate('2026-10-08', 'en-US')).toBe('10/8/2026');
        useTimeZone('Pacific/Kiritimati', -1);
        expect(formatPublicDate('2026-12-31', 'en-US')).toBe('12/31/2026');
    });

    it('依 locale 格式化、只有日期沒有時分', () => {
        useTimeZone('America/Los_Angeles', 1);
        expect(formatPublicDate('2026-10-08', 'zh-TW')).toBe('2026/10/8');
        expect(formatPublicDate('2026-10-08', 'zh-TW')).not.toMatch(/\d{1,2}:\d{2}/);
    });

    it('格式不符或 null 回空字串（不顯示）', () => {
        expect(formatPublicDate(null, 'en-US')).toBe('');
        expect(formatPublicDate(undefined, 'en-US')).toBe('');
        expect(formatPublicDate('2026-10-08T12:00:00Z', 'en-US')).toBe('');
        expect(formatPublicDate('not-a-date', 'en-US')).toBe('');
    });

    it('不存在的日期回空字串，不會被自動進位成別天', () => {
        expect(formatPublicDate('2026-02-31', 'en-US')).toBe('');
        expect(formatPublicDate('2026-02-29', 'en-US')).toBe(''); // 2026 不是閏年
        expect(formatPublicDate('2026-13-01', 'en-US')).toBe('');
        expect(formatPublicDate('2026-00-10', 'en-US')).toBe('');
        expect(formatPublicDate('2026-10-00', 'en-US')).toBe('');
        expect(formatPublicDate('2028-02-29', 'en-US')).toBe('2/29/2028'); // 閏年照常
    });
});
