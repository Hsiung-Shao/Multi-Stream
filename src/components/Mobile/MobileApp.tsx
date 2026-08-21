import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/useUIStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { MobileBottomNav, type MobileTab } from './MobileBottomNav';
import { MobileWatchPage } from './MobileWatchPage';
import { MobileChatPanel } from './MobileChatPanel';
import { MobileFavoritesPage } from './MobileFavoritesPage';
import { MobileSettingsPage } from './MobileSettingsPage';
import { MobileAddStreamModal } from './MobileAddStreamModal';
import { SEO } from '../SEO';
import { SEO_CANVAS } from '../../seo/defaults';
import { Toaster } from '../ui/sonner';
import { GlobalLiveStatusChecker } from '../../features/favorites/components/GlobalLiveStatusChecker';
import { CookieConsent } from '../CookieConsent';
import { AnnouncementsProvider } from '../../features/announcements/AnnouncementsProvider';
import { useMediaQuery } from '../../hooks/use-media-query';
import { useIslandQuickActions } from '../../hooks/useIslandQuickActions';
import { Share2 } from 'lucide-react';

const FavoritesManagerMain = lazy(() => import('../../features/favorites/components/FavoritesManagerMain').then(m => ({ default: m.FavoritesManagerMain })));
const FeedbackModal = lazy(() => import('../../features/feedback/FeedbackModal').then(m => ({ default: m.FeedbackModal })));
const VersionHistory = lazy(() => import('../VersionHistory').then(m => ({ default: m.VersionHistory })));

export function MobileApp() {
    const { t } = useTranslation();
    const tx = t as unknown as (key: string, options?: Record<string, unknown>) => string;
    const theme = useEffectiveTheme();
    const modals = useUIStore(s => s.modals);
    const closeModal = useUIStore(s => s.closeModal);
    const isLandscape = useMediaQuery('(orientation: landscape)');
    const { handleShareCanvas } = useIslandQuickActions();

    const [activeTab, setActiveTab] = useState<MobileTab>('watch');
    const [showAddStream, setShowAddStream] = useState(false);

    const renderTab = () => {
        switch (activeTab) {
            case 'watch':
                return <MobileWatchPage isLandscape={isLandscape} />;
            case 'chat':
                return <MobileChatPanel />;
            case 'favorites':
                return <MobileFavoritesPage />;
            case 'settings':
                return <MobileSettingsPage />;
        }
    };

    // In landscape, hide the header to maximize vertical space
    const showHeader = !isLandscape;

    return (
        <div className="h-dvh bg-background text-foreground flex flex-col overflow-hidden">
            {/* 手機版 /canvas 也要有正確的 title/canonical，不能落到首頁預設值 */}
            <SEO title={tx('seo:canvas.title')} description={tx('seo:canvas.description')} url={SEO_CANVAS.url} />

            {/* Mobile Header — hidden in landscape to save vertical space */}
            {showHeader && (
                <header className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-white/10 bg-gray-950/80 backdrop-blur-lg z-40">
                    <div className="flex items-center gap-2">
                        <img src="/logo.png" alt="MultiStream Hub" className="w-7 h-7 rounded-md" />
                        <span className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            MultiStream
                        </span>
                    </div>
                    {/* 分享畫布：複製 /canvas?streams=… 連結（與桌機動態島共用 useIslandQuickActions） */}
                    <button
                        type="button"
                        onClick={handleShareCanvas}
                        aria-label={t('common.share_canvas') || '分享畫布'}
                        title={t('common.share_canvas') || '分享畫布'}
                        className="inline-flex items-center justify-center size-9 rounded-lg text-emerald-300 hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors"
                    >
                        <Share2 size={18} />
                    </button>
                </header>
            )}

            {/* Tab Content — takes remaining height */}
            <main className="flex-1 min-h-0 flex flex-col">
                {renderTab()}
            </main>

            {/* Bottom Nav */}
            <MobileBottomNav
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onAddStream={() => setShowAddStream(true)}
                isLandscape={isLandscape}
            />

            {/* Add Stream Modal */}
            <MobileAddStreamModal
                open={showAddStream}
                onClose={() => setShowAddStream(false)}
            />

            {/* Global Modals (shared with desktop) */}
            {modals.favorites && (
                <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">{t('common.loading')}</div>}>
                    <FavoritesManagerMain
                        theme={theme}
                        onClose={() => closeModal('favorites')}
                    />
                </Suspense>
            )}

            {modals.feedback && (
                <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">{t('common.loading')}</div>}>
                    <FeedbackModal
                        theme={theme}
                        onClose={() => closeModal('feedback')}
                    />
                </Suspense>
            )}

            {modals.history && (
                <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">{t('common.loading')}</div>}>
                    <VersionHistory
                        theme={theme}
                        onClose={() => closeModal('history')}
                    />
                </Suspense>
            )}

            <GlobalLiveStatusChecker />
            <Toaster />
            <CookieConsent />
            <AnnouncementsProvider />
        </div>
    );
}
