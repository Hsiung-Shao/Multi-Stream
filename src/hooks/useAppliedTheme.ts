import { useUIStore } from '../store/useUIStore';
import { useEffectiveTheme } from './useEffectiveTheme';

/**
 * 「實際套用到 documentElement」的主題。
 *
 * 與 useEffectiveTheme 的差異:admin 後台一律強制深色(後台 UI 只設計深色版),
 * 其餘頁面用使用者解析後的主題。統一由這裡決定,避免出現第二個
 * documentElement classList 寫入者互相覆蓋(例:theme='system' 時 OS 切換)。
 */
export function useAppliedTheme(): 'light' | 'dark' {
    const page = useUIStore(s => s.page);
    const resolved = useEffectiveTheme();
    return page === 'admin' ? 'dark' : resolved;
}
