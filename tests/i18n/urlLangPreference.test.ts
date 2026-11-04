// 網址命中 /zh-TW 只決定本頁語言、不改長期偏好（review 第 2 輪建議補的鎖）：
// i18n 模組在 import 時就 init，所以每條都 resetModules 後重新載入。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function loadI18nAt(pathname: string) {
    window.history.replaceState(null, '', pathname);
    vi.resetModules();
    const mod = await import('../../src/i18n/i18n');
    return mod.default;
}

describe('urlPath 偵測不改 i18nextLng', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        window.history.replaceState(null, '', '/');
        localStorage.clear();
    });

    it('L22 原本存 en 開 /zh-TW/about：本頁 zh-TW，i18nextLng 仍是 en', async () => {
        localStorage.setItem('i18nextLng', 'en');
        const i18n = await loadI18nAt('/zh-TW/about');
        expect(i18n.language).toBe('zh-TW');
        expect(localStorage.getItem('i18nextLng')).toBe('en');
    });

    it('L22b 原本沒存開 /zh-TW：本頁 zh-TW，不留下 i18nextLng', async () => {
        const i18n = await loadI18nAt('/zh-TW');
        expect(i18n.language).toBe('zh-TW');
        expect(localStorage.getItem('i18nextLng')).toBeNull();
    });

    it('L22c 無前綴網址照常用存的偏好，且偏好不變', async () => {
        localStorage.setItem('i18nextLng', 'zh-TW');
        const i18n = await loadI18nAt('/about');
        expect(i18n.language).toBe('zh-TW');
        expect(localStorage.getItem('i18nextLng')).toBe('zh-TW');
    });
});

describe('switchLanguage：選單明確選擇才寫偏好', () => {
    afterEach(async () => {
        localStorage.clear();
        window.history.replaceState(null, '', '/');
    });

    it('L23 偏好 en 的人在 /zh-TW 頁選「繁體中文」（值相同）：偏好改成 zh-TW', async () => {
        localStorage.setItem('i18nextLng', 'en');
        const i18n = await loadI18nAt('/zh-TW/about');
        expect(i18n.language).toBe('zh-TW');
        expect(localStorage.getItem('i18nextLng')).toBe('en');
        const { switchLanguage } = await import('../../src/i18n/switchLanguage');
        switchLanguage('zh-TW');
        expect(localStorage.getItem('i18nextLng')).toBe('zh-TW');
    });
});
