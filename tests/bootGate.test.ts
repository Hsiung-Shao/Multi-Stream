// 啟動閘門預判：只有「預渲染頁且語言／主題與使用者相符（boot.tsx 會 hydrate）」才等 FCP，其餘立即啟動
import { describe, it, expect } from 'vitest';
import { willHydratePrerender } from '../src/bootGate';

const page = (lang: string, theme = 'dark') => ({ prerenderLang: lang, prerenderTheme: theme });

describe('willHydratePrerender', () => {
    it('非預渲染頁（沒有 data-prerender-lang）不等', () => {
        expect(willHydratePrerender({}, { theme: null, lng: null, navLang: 'en-US' })).toBe(false);
    });
    it('英文頁＋未存偏好＋瀏覽器英文＋預設主題 → 等', () => {
        expect(willHydratePrerender(page('en'), { theme: null, lng: null, navLang: 'en-US' })).toBe(true);
    });
    it('英文頁但已存偏好 ja → 不等', () => {
        expect(willHydratePrerender(page('en'), { theme: null, lng: 'ja', navLang: 'en-US' })).toBe(false);
    });
    it('英文頁＋未存偏好＋瀏覽器韓文 → 不等', () => {
        expect(willHydratePrerender(page('en'), { theme: null, lng: null, navLang: 'ko-KR' })).toBe(false);
    });
    it('使用者主題改成淺色 → 不等', () => {
        expect(willHydratePrerender(page('en'), { theme: 'light', lng: 'en', navLang: 'en-US' })).toBe(false);
    });
    it('繁中頁（網址語言優先）即使偏好是英文也等', () => {
        expect(willHydratePrerender(page('zh-TW'), { theme: 'dark', lng: 'en', navLang: 'en-US' })).toBe(true);
    });
});
