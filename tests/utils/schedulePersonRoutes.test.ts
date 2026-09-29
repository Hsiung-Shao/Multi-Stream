// 個人週表頁路由：/schedule/<slug> ↔ schedule:<slug>，不影響固定路由的一比一對照
import { describe, it, expect } from 'vitest';
import { pathToPage, pageToPath, PAGE_PATHS } from '../../src/config/routes';
import { isSchedulePersonPage, schedulePersonFromPath, schedulePersonPage } from '../../src/config/schedulePerson';

describe('schedulePerson 路由', () => {
    it('合規 slug 解析成個人頁，往返一致', () => {
        expect(pathToPage('/schedule/taione')).toBe('schedule:taione');
        expect(pageToPath(schedulePersonPage('taione'))).toBe('/schedule/taione');
    });

    it('大寫與百分比編碼會正規化成小寫', () => {
        expect(schedulePersonFromPath('/schedule/TaiOne')).toBe('schedule:taione');
        expect(schedulePersonFromPath('/schedule/tai%2Done')).toBe('schedule:tai-one');
    });

    it('不合規則的 slug 與多層路徑 → not-found', () => {
        expect(pathToPage('/schedule/a')).toBe('not-found');
        expect(pathToPage('/schedule/中文')).toBe('not-found');
        expect(pathToPage('/schedule/a/b')).toBe('not-found');
        expect(pathToPage('/schedule/-abc')).toBe('not-found');
        // 壞掉的百分比編碼不能丟例外（store 初始化時呼叫，丟出去會白屏）
        expect(() => pathToPage('/schedule/%E0%A4%A')).not.toThrow();
        expect(pathToPage('/schedule/%E0%A4%A')).toBe('not-found');
    });

    it('/schedule 本身仍是公共週表；個人頁不在 PAGE_PATHS 裡', () => {
        expect(pathToPage('/schedule')).toBe('schedule');
        expect(Object.keys(PAGE_PATHS).some((k) => k.startsWith('schedule:'))).toBe(false);
    });

    it('isSchedulePersonPage 只認合規 slug', () => {
        expect(isSchedulePersonPage('schedule:taione')).toBe(true);
        expect(isSchedulePersonPage('schedule')).toBe(false);
        expect(isSchedulePersonPage('schedule:BAD')).toBe(false);
    });
});
