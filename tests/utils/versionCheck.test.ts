// 版本更新時的 localStorage 清理（2026-09）：原本保留清單漏了 stream-storage（自訂版面、畫布）、
// 語言、Cookie 同意、Twitch 連結等，每次發版都會被刪掉；自訂版面連 IndexedDB 備份都沒有，刪了找不回來。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkAppVersion, PRESERVED_KEYS } from '../../src/utils/versionCheck';

/** tests/setup.ts 的 localStorage mock 沒有 key()/length，清理迴圈跑不到；這裡換成完整的 Storage */
function makeStorage(): Storage {
    const m = new Map<string, string>();
    return {
        get length() { return m.size; },
        key: (i: number) => [...m.keys()][i] ?? null,
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => { m.set(k, String(v)); },
        removeItem: (k: string) => { m.delete(k); },
        clear: () => m.clear(),
    };
}

describe('checkAppVersion', () => {
    const original = window.localStorage;
    const reload = vi.fn();
    const originalLocation = window.location;

    beforeEach(() => {
        Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true });
        Object.defineProperty(window, 'location', { value: { ...originalLocation, reload }, configurable: true });
        reload.mockClear();
    });
    afterEach(() => {
        Object.defineProperty(window, 'localStorage', { value: original, configurable: true });
        Object.defineProperty(window, 'location', { value: originalLocation, configurable: true });
    });

    it('從舊版升級：使用者資料與偏好全部保留（含自訂版面），只清快取與暫存，並重新載入', () => {
        localStorage.setItem('app_version', '0.0.1-old');
        for (const k of PRESERVED_KEYS) if (k !== 'app_version') localStorage.setItem(k, `v:${k}`);
        localStorage.setItem('ms_yt_live_checked_at', '123');           // 快取：應清掉
        localStorage.setItem('admin-feedbacks', '[]');                   // 後台查詢快取：應清掉
        localStorage.setItem('backup_20260101', '{}');                   // backup_ 開頭：保留

        checkAppVersion();

        for (const k of PRESERVED_KEYS) {
            if (k === 'app_version') continue;
            expect(localStorage.getItem(k), k).toBe(`v:${k}`);
        }
        expect(localStorage.getItem('ms_yt_live_checked_at')).toBeNull();
        expect(localStorage.getItem('admin-feedbacks')).toBeNull();
        expect(localStorage.getItem('backup_20260101')).toBe('{}');
        expect(localStorage.getItem('app_version')).toBe(__APP_VERSION__);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('一定要保留的關鍵資料都在清單裡', () => {
        for (const k of ['stream-storage', 'favoriteStreams', 'preference_tags', 'userSettings', 'i18nextLng', 'cookie_consent', 'twitchAccessToken']) {
            expect(PRESERVED_KEYS).toContain(k);
        }
    });

    it('首次造訪（沒有舊版本）：不重新載入', () => {
        checkAppVersion();
        expect(localStorage.getItem('app_version')).toBe(__APP_VERSION__);
        expect(reload).not.toHaveBeenCalled();
    });

    it('版本相同：什麼都不做', () => {
        localStorage.setItem('app_version', __APP_VERSION__);
        localStorage.setItem('ms_yt_live_checked_at', '123');
        checkAppVersion();
        expect(localStorage.getItem('ms_yt_live_checked_at')).toBe('123');
        expect(reload).not.toHaveBeenCalled();
    });
});
