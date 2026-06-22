import { useEffect } from 'react';
import { useEffectiveTheme } from './useEffectiveTheme';

/**
 * Hook to manage theme system side effects.
 * Synchonizes the resolved theme to the document's classList.
 *
 * 主題解析(含 'system' 跟隨 prefers-color-scheme 與即時切換)
 * 統一由 useEffectiveTheme 負責,這裡只負責把結果套到 documentElement。
 */
export function useThemeSystem() {
    const resolved = useEffectiveTheme();

    useEffect(() => {
        const root = window.document.documentElement;
        // Remove both potential classes first to be clean (though usually we just toggle dark)
        root.classList.remove('light', 'dark');
        root.classList.add(resolved);
    }, [resolved]);
}
