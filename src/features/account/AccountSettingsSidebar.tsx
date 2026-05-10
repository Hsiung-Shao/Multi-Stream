import { User, Star, type LucideIcon } from 'lucide-react';
import { cn } from '../../components/ui/utils';

// 帳號頁兩大分組（合併原本 6 項）：
//   general — 一般：基本資料 + 顯示名稱 + 兩步驟驗證 + 登入方式
//   favorites_sync — 收藏與同步：收藏列表 + Twitch 匯入 + 雲端同步
export type AccountSectionKey = 'general' | 'favorites_sync';

export interface AccountSidebarItem {
    key: AccountSectionKey;
    label: string;
    icon: LucideIcon;
}

interface AccountSettingsSidebarProps {
    items: AccountSidebarItem[];
    active: AccountSectionKey;
    onChange: (key: AccountSectionKey) => void;
    className?: string;
}

/**
 * 帳號設定頁左側 nav。
 * Desktop only — caller 須加 `hidden md:flex` class（mobile 改 vertical stack 全顯示）。
 */
export function AccountSettingsSidebar({
    items,
    active,
    onChange,
    className,
}: AccountSettingsSidebarProps) {
    return (
        <nav
            aria-label="account settings sections"
            className={cn(
                'flex flex-col gap-1 p-2 rounded-xl border border-white/10 bg-card/40 sticky top-20 self-start',
                className,
            )}
        >
            {items.map(({ key, label, icon: Icon }) => {
                const isActive = active === key;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                            'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                            isActive
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                        )}
                    >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{label}</span>
                    </button>
                );
            })}
        </nav>
    );
}

// 預設項目集合（label 走 i18n，由 AccountSettingsPage 注入翻譯）
export function buildSidebarItems(t: (key: string, fallback: string) => string): AccountSidebarItem[] {
    return [
        { key: 'general', label: t('sidebar.general', '一般'), icon: User },
        { key: 'favorites_sync', label: t('sidebar.favoritesSync', '收藏與同步'), icon: Star },
    ];
}
