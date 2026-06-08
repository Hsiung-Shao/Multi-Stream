import { useEffect } from 'react';
import { useUIStore } from '../store/useUIStore';

/**
 * Hook to manage theme system side effects.
 * Synchonizes the theme state from useUIStore to the document's classList and meta tags.
 *
 * theme === 'system' 時跟隨作業系統的 prefers-color-scheme,並在系統切換時即時更新。
 */
export function useThemeSystem() {
    const theme = useUIStore((state) => state.theme);

    useEffect(() => {
        const root = window.document.documentElement;

        const apply = (resolved: 'light' | 'dark') => {
            // Remove both potential classes first to be clean (though usually we just toggle dark)
            root.classList.remove('light', 'dark');
            root.classList.add(resolved);
        };

        if (theme === 'system') {
            const mql = window.matchMedia('(prefers-color-scheme: dark)');
            apply(mql.matches ? 'dark' : 'light');
            // 跟隨系統切換
            const onChange = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        }

        apply(theme);
    }, [theme]);
}
