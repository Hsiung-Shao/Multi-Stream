import { renderHook, act } from '@testing-library/react';
import { useThemeSystem } from '../../src/hooks/useThemeSystem';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUIStore } from '../../src/store/useUIStore';

// Mock useUIStore
vi.mock('../../src/store/useUIStore');

describe('useThemeSystem', () => {
    let mockTheme = 'light';
    let mockToggleTheme = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockTheme = 'light';
        // Reset document class
        document.documentElement.classList.remove('dark');

        // Mock implementation
        (useUIStore as any).mockImplementation((selector: any) => selector({
            theme: mockTheme,
            toggleTheme: mockToggleTheme
        }));
    });

    it('should apply light theme class', () => {
        renderHook(() => useThemeSystem());
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should apply dark theme class', () => {
        mockTheme = 'dark';
        renderHook(() => useThemeSystem());
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should toggle theme via store', () => {
        const { result } = renderHook(() => useThemeSystem());

        act(() => {
            // function returned by hook (handleToggleTheme) calls store.toggleTheme
            result.current.handleToggleTheme();
        });

        expect(mockToggleTheme).toHaveBeenCalled();
    });
});
