// 改版號清 localStorage 時，Supabase 登入（sb-*）與雲端同步快照（ms_cloud_sync:*）必須保留。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkAppVersion } from '../../src/utils/versionCheck';

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

describe('checkAppVersion 保留登入與同步快照', () => {
    const original = window.localStorage;
    const originalLocation = window.location;
    beforeEach(() => {
        Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true });
        Object.defineProperty(window, 'location', { value: { ...originalLocation, reload: vi.fn() }, configurable: true });
    });
    afterEach(() => {
        Object.defineProperty(window, 'localStorage', { value: original, configurable: true });
        Object.defineProperty(window, 'location', { value: originalLocation, configurable: true });
    });

    it('V1 改版號不清登入與同步快照，其他非白名單鍵照清', () => {
        localStorage.setItem('app_version', '0.0.1-old');
        localStorage.setItem('sb-abcdefg-auth-token', '{"access_token":"x"}');
        localStorage.setItem('sb-abcdefg-auth-token-code-verifier', 'v');
        localStorage.setItem('ms_cloud_sync:u1', '{"favorites":[]}');
        localStorage.setItem('ms_yt_live_checked_at', '123');
        localStorage.setItem('some_random_cache', 'x');

        checkAppVersion();

        expect(localStorage.getItem('sb-abcdefg-auth-token')).toBe('{"access_token":"x"}');
        expect(localStorage.getItem('sb-abcdefg-auth-token-code-verifier')).toBe('v');
        expect(localStorage.getItem('ms_cloud_sync:u1')).toBe('{"favorites":[]}');
        expect(localStorage.getItem('ms_yt_live_checked_at')).toBeNull();
        expect(localStorage.getItem('some_random_cache')).toBeNull();
        expect(localStorage.getItem('app_version')).toBe(__APP_VERSION__);
    });
});
