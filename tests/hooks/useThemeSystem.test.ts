import { renderHook } from '@testing-library/react';
import { useThemeSystem } from '../../src/hooks/useThemeSystem';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUIStore } from '../../src/store/useUIStore';

// useThemeSystem 沒有回傳值:它只把 useAppliedTheme 解析出的主題同步到 <html class>。
// 主題解析鏈:useUIStore.theme('light' | 'dark' | 'system')→ useEffectiveTheme(system 看 matchMedia)
// → useAppliedTheme(admin 頁一律 dark)。這裡測的是整條鏈落到 DOM 的結果。
vi.mock('../../src/store/useUIStore');

type UIState = { theme: 'light' | 'dark' | 'system'; page: string };

const mockUI = (state: UIState) => {
    (useUIStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector: (s: UIState) => unknown) => selector(state),
    );
};

const mockSystemDark = (matches: boolean) => {
    (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
};

describe('useThemeSystem', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.documentElement.classList.remove('light', 'dark');
        mockSystemDark(false);
    });

    it('applies light class for theme=light', () => {
        mockUI({ theme: 'light', page: 'home' });
        renderHook(() => useThemeSystem());
        expect(document.documentElement.classList.contains('light')).toBe(true);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('applies dark class for theme=dark', () => {
        mockUI({ theme: 'dark', page: 'home' });
        renderHook(() => useThemeSystem());
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.classList.contains('light')).toBe(false);
    });

    it('theme=system follows prefers-color-scheme', () => {
        mockSystemDark(true);
        mockUI({ theme: 'system', page: 'home' });
        renderHook(() => useThemeSystem());
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('admin page forces dark even when theme=light', () => {
        mockUI({ theme: 'light', page: 'admin' });
        renderHook(() => useThemeSystem());
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.classList.contains('light')).toBe(false);
    });

    it('replaces a stale class instead of stacking both', () => {
        document.documentElement.classList.add('dark');
        mockUI({ theme: 'light', page: 'home' });
        renderHook(() => useThemeSystem());
        expect(document.documentElement.className).toBe('light');
    });
});
