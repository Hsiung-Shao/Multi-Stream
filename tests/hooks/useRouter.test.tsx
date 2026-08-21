import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// useUIStore 的 page 初值在模組載入時由 location 推導，所以每題都要在設定 URL 後重新載入模組
async function loadFresh(url: string) {
    window.history.replaceState(null, '', url);
    vi.resetModules();
    const [{ useRouter }, { useUIStore }] = await Promise.all([
        import('../../src/hooks/useRouter'),
        import('../../src/store/useUIStore'),
    ]);
    return { useRouter, useUIStore };
}

describe('useRouter 首次 mount 與 URL 同步', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('deep-link 直開 /canvas?streams=…：page 由 URL 推導、query 保留、不多塞 history', async () => {
        const { useRouter, useUIStore } = await loadFresh('/canvas?streams=tw:a,yt:b');
        const before = window.history.length;
        renderHook(() => useRouter());
        expect(useUIStore.getState().page).toBe('canvas');
        expect(window.location.pathname).toBe('/canvas');
        expect(window.location.search).toBe('?streams=tw:a,yt:b');
        expect(window.history.length).toBe(before);
    });

    it('舊 .html 別名：解析為對應頁並 replaceState 成乾淨路徑', async () => {
        const { useRouter, useUIStore } = await loadFresh('/about.html');
        const before = window.history.length;
        renderHook(() => useRouter());
        expect(useUIStore.getState().page).toBe('about');
        expect(window.location.pathname).toBe('/about');
        expect(window.history.length).toBe(before); // replaceState 不增加
    });

    it('切頁 pushState 到對應路徑；未知路徑維持 not-found 且不動 URL', async () => {
        const { useRouter, useUIStore } = await loadFresh('/');
        renderHook(() => useRouter());
        act(() => useUIStore.getState().setPage('faq'));
        expect(window.location.pathname).toBe('/faq');

        const { useRouter: useRouter2, useUIStore: store2 } = await loadFresh('/no-such-page');
        renderHook(() => useRouter2());
        expect(store2.getState().page).toBe('not-found');
        expect(window.location.pathname).toBe('/no-such-page');
    });
});
