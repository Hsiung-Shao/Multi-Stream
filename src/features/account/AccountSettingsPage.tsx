import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useUIStore } from '../../store/useUIStore';
import { useAuthContext } from '../../contexts/AuthContext';
import { SEO } from '../../components/SEO';
import { IdentitiesSection } from './IdentitiesSection';
import { TwoFactorSection } from './TwoFactorSection';
import { CloudSyncSection } from '../favorites/CloudSyncSection';
import { GeneralSection } from './GeneralSection';
import { FavoritesSection } from './FavoritesSection';
import { TwitchImportSection } from './TwitchImportSection';
import {
    AccountSettingsSidebar,
    buildSidebarItems,
    type AccountSectionKey,
} from './AccountSettingsSidebar';

/**
 * 帳號設定頁
 *
 * Route：/{lang}/account
 *
 * Layout：
 *   - Desktop (≥ md)：左 sidebar nav + 右側單一 active section
 *   - Mobile (< md)：所有 section 垂直堆疊（不顯示 sidebar）
 *
 * 未登入 → 顯示提示 + 返回首頁按鈕
 */
export function AccountSettingsPage() {
    const { t } = useTranslation('account');
    const setPage = useUIStore((s) => s.setPage);
    const { isLoggedIn, isLoading } = useAuthContext();

    const [activeSection, setActiveSection] = useState<AccountSectionKey>('general');

    const sidebarItems = useMemo(
        () => buildSidebarItems((key, fallback) => t(key, { defaultValue: fallback })),
        [t],
    );

    const sections = useMemo<Array<{ key: AccountSectionKey; node: React.ReactNode }>>(
        () => [
            { key: 'general', node: <GeneralSection /> },
            { key: '2fa', node: <TwoFactorSection /> },
            { key: 'favorites', node: <FavoritesSection /> },
            { key: 'twitch', node: <TwitchImportSection /> },
            { key: 'sync', node: <CloudSyncSection /> },
            { key: 'identities', node: <IdentitiesSection /> },
        ],
        [],
    );

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
                <SEO
                    title={t('seoTitle', '帳號設定 | MultiStream Hub')}
                    description={t('seoDesc', '管理你的登入方式與帳號資料。')}
                    pathWithoutLang="/account"
                    robots="noindex, nofollow"
                />
                <div className="flex flex-col items-center gap-3 max-w-sm text-center bg-card/50 border border-white/10 rounded-xl p-6">
                    <p className="text-sm">{t('signInRequired', '此頁面需登入後才能存取')}</p>
                    <Button variant="outline" size="sm" onClick={() => setPage('home')}>
                        {t('common:backToHome', '返回首頁')}
                    </Button>
                </div>
            </div>
        );
    }

    const activeNode = sections.find((s) => s.key === activeSection)?.node ?? null;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <SEO
                title={t('seoTitle', '帳號設定 | MultiStream Hub')}
                description={t('seoDesc', '管理你的登入方式與帳號資料。')}
                pathWithoutLang="/account"
                robots="noindex, nofollow"
            />

            <header className="sticky top-0 w-full z-40 border-b border-white/10 bg-background/80 backdrop-blur-md">
                <div className="container mx-auto px-4 h-16 flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => setPage('home')}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-lg font-bold">{t('pageTitle', '帳號設定')}</h1>
                </div>
            </header>

            {/* Desktop layout: sidebar + single active section */}
            <main className="hidden md:grid container mx-auto px-4 py-8 max-w-5xl gap-6 md:grid-cols-[220px_1fr]">
                <AccountSettingsSidebar
                    items={sidebarItems}
                    active={activeSection}
                    onChange={setActiveSection}
                />
                <div className="min-w-0">{activeNode}</div>
            </main>

            {/* Mobile layout: vertical stack 全部 sections（不顯示 sidebar） */}
            <main className="md:hidden container mx-auto px-4 py-8 max-w-2xl space-y-6">
                {sections.map((s) => (
                    <div key={s.key}>{s.node}</div>
                ))}
            </main>
        </div>
    );
}
