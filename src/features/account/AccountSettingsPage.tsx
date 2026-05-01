import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useUIStore } from '../../store/useUIStore';
import { useAuthContext } from '../../contexts/AuthContext';
import { SEO } from '../../components/SEO';
import { IdentitiesSection } from './IdentitiesSection';

/**
 * 帳號設定頁 — Identity Linking、未來的 display name、2FA、刪除帳號入口都聚集這裡
 *
 * Route：/{lang}/account
 * 未登入 → 顯示提示 + 返回首頁按鈕
 */
export function AccountSettingsPage() {
    const { t } = useTranslation('account');
    const setPage = useUIStore((s) => s.setPage);
    const { isLoggedIn, isLoading, profile } = useAuthContext();

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

    return (
        <div className="min-h-screen bg-background text-foreground">
            <SEO
                title={t('seoTitle', '帳號設定 | MultiStream Hub')}
                description={t('seoDesc', '管理你的登入方式與帳號資料。')}
                pathWithoutLang="/account"
                robots="noindex, nofollow"
            />

            <header className="sticky top-0 w-full z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
                <div className="container mx-auto px-4 h-16 flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => setPage('home')}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-lg font-bold">{t('pageTitle', '帳號設定')}</h1>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
                {profile && (
                    <section className="rounded-xl border border-white/10 bg-card/50 p-5">
                        <h2 className="text-sm text-muted-foreground mb-1">
                            {t('overview.displayName', '目前顯示名稱')}
                        </h2>
                        <p className="text-base font-medium">{profile.display_name || '—'}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                            {t('overview.trustLevel', '帳號等級')}: <span className="text-foreground">{profile.trust_level}</span>
                        </p>
                    </section>
                )}

                <IdentitiesSection />

                {/* 未來 PR 5/6/7 會加：DisplayNameSection / FavoritesSyncSection / MfaSection */}
            </main>
        </div>
    );
}
