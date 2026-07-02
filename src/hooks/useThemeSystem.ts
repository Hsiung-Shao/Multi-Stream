import { useLayoutEffect } from 'react';
import { useAppliedTheme } from './useAppliedTheme';

/**
 * Hook to manage theme system side effects.
 * Synchonizes the resolved theme to the document's classList.
 *
 * 主題解析(含 'system' 跟隨 prefers-color-scheme 與即時切換、admin 強制深色)
 * 統一由 useAppliedTheme 負責,這裡只負責把結果套到 documentElement。
 * 用 useLayoutEffect 讓 class 在 paint 前就緒,避免主題切換(如進入 admin
 * 強制深色)時出現一幀錯誤配色的閃爍。
 */
export function useThemeSystem() {
    const resolved = useAppliedTheme();

    useLayoutEffect(() => {
        const root = window.document.documentElement;
        // Remove both potential classes first to be clean (though usually we just toggle dark)
        root.classList.remove('light', 'dark');
        root.classList.add(resolved);
    }, [resolved]);
}
