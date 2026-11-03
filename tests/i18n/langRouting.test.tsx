// 語言前綴網址（/zh-TW/...）的前端端：routes 對照、RouteLink、useRouter 換網址、SEO canonical／hreflang、
// 根網址轉址判斷、切語言不動其他 localStorage。L 編號對應計畫的測試規格表（edge 端在 tests/functions/langUrls.test.ts）。
import { render, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as routes from '../../src/config/routes';
import { RouteLink } from '../../src/components/Navigation/RouteLink';
import { SEO } from '../../src/components/SEO';
import { useRouter } from '../../src/hooks/useRouter';
import { useUIStore } from '../../src/store/useUIStore';
import i18n from '../../src/i18n/i18n';

const SITE = 'https://multistreaming.org';

// 新 API 還不存在：型別放寬、行為在執行期失敗（每條 it 各自紅，不是整檔載入失敗）
const pageToPath = routes.pageToPath as unknown as (page: string, urlLang?: 'en' | 'zh-TW') => string | null;
const langFromPath = (routes as unknown as { langFromPath: (p: string) => 'zh-TW' | null }).langFromPath;
const SEOX = SEO as unknown as (props: Record<string, unknown>) => null;

// rootRedirect.ts 還不存在：動態載入
const ROOT_REDIRECT_MODULE = '../../src/i18n/rootRedirect';
const loadRootRedirect = () => import(/* @vite-ignore */ ROOT_REDIRECT_MODULE);

/** tests/setup.ts 的 localStorage mock 沒有 key()/length；要逐 key 比對得換成完整的 Storage */
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

describe('routes 對照', () => {
    it('L3 pathToPage 看穿 /zh-TW 前綴', () => {
        expect(routes.pathToPage('/zh-TW/instructions/canvas')).toBe('instructions:canvas');
        expect(routes.pathToPage('/zh-TW/schedule/abc')).toBe('schedule:abc');
        expect(routes.pathToPage('/zh-TW')).toBe('home');
    });

    it('L4 pageToPath 依語言加前綴，預設英文；langFromPath 讀出前綴語言', () => {
        expect(pageToPath('about', 'zh-TW')).toBe('/zh-TW/about');
        expect(pageToPath('home', 'zh-TW')).toBe('/zh-TW');
        expect(pageToPath('about')).toBe('/about');
        expect(langFromPath('/zh-TW/about')).toBe('zh-TW');
        expect(langFromPath('/about')).toBeNull();
    });
});

describe('RouteLink', () => {
    afterEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('L5 中文介面 href 帶 /zh-TW 前綴，英文介面維持原路徑', async () => {
        await i18n.changeLanguage('zh-TW');
        const zh = render(<RouteLink to="about">關於</RouteLink>);
        expect(zh.getByRole('link', { name: '關於' }).getAttribute('href')).toBe('/zh-TW/about');
        zh.unmount();

        await i18n.changeLanguage('en');
        const en = render(<RouteLink to="about">About</RouteLink>);
        expect(en.getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about');
    });
});

describe('useRouter 切語言', () => {
    beforeEach(async () => {
        window.history.replaceState(null, '', '/about');
        await i18n.changeLanguage('en');
        act(() => useUIStore.getState().setPage('about'));
    });
    afterEach(async () => {
        vi.restoreAllMocks();
        await i18n.changeLanguage('en');
        window.history.replaceState(null, '', '/');
    });

    it('L6 語言 en→zh-TW：用 replaceState 把網址換成 /zh-TW/about，不呼叫 pushState', async () => {
        renderHook(() => useRouter());
        expect(window.location.pathname).toBe('/about');
        const replaceSpy = vi.spyOn(window.history, 'replaceState');
        const pushSpy = vi.spyOn(window.history, 'pushState');

        await act(async () => {
            await i18n.changeLanguage('zh-TW');
        });

        expect(replaceSpy).toHaveBeenCalled();
        expect(String(replaceSpy.mock.calls.at(-1)?.[2])).toContain('/zh-TW/about');
        expect(window.location.pathname).toBe('/zh-TW/about');
        expect(pushSpy).not.toHaveBeenCalled();
    });
});

describe('SEO path：canonical 與 hreflang', () => {
    const canonical = () => document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
    const hreflangs = () => {
        const out: Record<string, string> = {};
        document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => {
            out[l.getAttribute('hreflang') as string] = l.getAttribute('href') as string;
        });
        return out;
    };

    beforeEach(() => {
        document.head.innerHTML = '';
    });
    afterEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('L15 canonical 依語言加前綴、維護三個 hreflang；noindex 時全部移除', async () => {
        await i18n.changeLanguage('en');
        const en = render(<SEOX path="/about" title="x" />);
        expect(canonical()).toBe(`${SITE}/about`);
        expect(hreflangs()).toEqual({ en: `${SITE}/about`, 'zh-TW': `${SITE}/zh-TW/about`, 'x-default': `${SITE}/about` });
        en.unmount();

        document.head.innerHTML = '';
        await i18n.changeLanguage('zh-TW');
        const zh = render(<SEOX path="/about" title="x" />);
        expect(canonical()).toBe(`${SITE}/zh-TW/about`);
        expect(hreflangs()).toEqual({ en: `${SITE}/about`, 'zh-TW': `${SITE}/zh-TW/about`, 'x-default': `${SITE}/about` });

        zh.rerender(<SEOX path="/about" title="x" noindex />);
        expect(canonical()).toBeNull();
        expect(document.querySelectorAll('link[rel="alternate"]').length).toBe(0);
    });
});

describe('根網址轉址判斷', () => {
    it('L17 rootRedirectTarget：zh-TW 偏好或中文瀏覽器轉去前綴網址，其餘不轉', async () => {
        const { rootRedirectTarget } = await loadRootRedirect();
        expect(rootRedirectTarget('/about', '', '', 'zh-TW', 'en-US')).toBe('/zh-TW/about');
        expect(rootRedirectTarget('/', '', '', null, 'zh-TW')).toBe('/zh-TW');
        expect(rootRedirectTarget('/', '', '', null, 'en-US')).toBeNull();
        expect(rootRedirectTarget('/', '', '', 'en', 'zh-TW')).toBeNull();
        expect(rootRedirectTarget('/zh-TW/about', '', '', 'zh-TW', 'zh-TW')).toBeNull();
        expect(rootRedirectTarget('/', '', '', null, 'zh-CN')).toBeNull();
        // query 與 hash 原樣帶過去
        expect(rootRedirectTarget('/canvas', '?streams=tw:a', '#x', 'zh-TW', undefined)).toBe('/zh-TW/canvas?streams=tw:a#x');
    });
});

describe('切語言與轉址不動其他 localStorage', () => {
    const original = window.localStorage;
    beforeEach(async () => {
        Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true });
        window.history.replaceState(null, '', '/about');
        await i18n.changeLanguage('en');
        act(() => useUIStore.getState().setPage('about'));
    });
    afterEach(async () => {
        await i18n.changeLanguage('en');
        Object.defineProperty(window, 'localStorage', { value: original, configurable: true });
        window.history.replaceState(null, '', '/');
    });

    it('L18 跑完切語言與轉址判斷：stream-storage、cookie-consent 原值不變，key 集合除 i18nextLng 外沒增減', async () => {
        localStorage.setItem('stream-storage', '{"state":{"streams":[1,2,3]},"version":1}');
        localStorage.setItem('cookie-consent', 'accepted');
        localStorage.setItem('i18nextLng', 'en');
        const keysBefore = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) as string).filter((k) => k !== 'i18nextLng').sort();
        const before = keysBefore();

        const { rootRedirectTarget } = await loadRootRedirect();
        renderHook(() => useRouter());
        await act(async () => {
            await i18n.changeLanguage('zh-TW');
        });
        rootRedirectTarget('/about', '', '', localStorage.getItem('i18nextLng'), 'zh-TW');
        rootRedirectTarget('/', '', '', null, 'zh-TW');

        expect(localStorage.getItem('stream-storage')).toBe('{"state":{"streams":[1,2,3]},"version":1}');
        expect(localStorage.getItem('cookie-consent')).toBe('accepted');
        expect(keysBefore()).toEqual(before);
    });
});
