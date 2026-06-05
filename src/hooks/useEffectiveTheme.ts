import { useEffect, useState } from 'react';
import { useUIStore } from '../store/useUIStore';

/**
 * 把使用者選擇的主題('light' | 'dark' | 'system')解析成「實際套用」的 'light' | 'dark'。
 *
 * theme === 'system' 時跟隨作業系統的 prefers-color-scheme,並在系統切換時即時更新。
 * 給需要以具體明暗值做樣式判斷的元件使用(取代直接讀 store 的 raw theme)。
 * 想知道使用者「原始選擇」(含 'system')請直接讀 useUIStore(s => s.theme)。
 */
export function useEffectiveTheme(): 'light' | 'dark' {
    const theme = useUIStore(s => s.theme);
    const [systemDark, setSystemDark] = useState(
        () => typeof window !== 'undefined'
            && window.matchMedia('(prefers-color-scheme: dark)').matches,
    );

    useEffect(() => {
        if (theme !== 'system') return;
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        setSystemDark(mql.matches);
        const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [theme]);

    if (theme === 'system') return systemDark ? 'dark' : 'light';
    return theme;
}
