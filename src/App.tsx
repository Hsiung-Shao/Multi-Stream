import { lazy, Suspense, useEffect } from 'react';
import { useIsMobile } from './hooks/useIsMobile';
import { useTranslation } from 'react-i18next';
import { useUIStore } from './store/useUIStore';
import { useEffectiveTheme } from './hooks/useEffectiveTheme';
import { parsePath, pathToPage } from './lib/i18nRouting';
import { useStreamStore } from './store/useStreamStore';
import { useYouTubeRisk } from './hooks/useYouTubeRisk';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useThemeSystem } from './hooks/useThemeSystem';
import { useRouter } from './hooks/useRouter';
import { RETURN_PAGE_KEY } from './hooks/useTwitchAuth';
import { initGA, logPageView } from './utils/analytics';
import { useCanvasRetention } from './hooks/useCanvasRetention';
import { SEO } from './components/SEO'; // Default SEO for App? Or remove?
import { YouTubeRiskDialog } from './components/YouTubeRiskDialog';
import { Toaster } from './components/ui/sonner';
import { PerformanceOverlay } from './components/Navigation/PerformanceOverlay';
import { GlobalLiveStatusChecker } from './features/favorites/components/GlobalLiveStatusChecker';
import { useHotkeys } from './hooks/useHotkeys';
import { HotkeyHelpDialog } from './components/Dialogs/HotkeyHelpDialog';
import { useEngagementTracking } from './hooks/useEngagementTracking';
import { CookieConsent } from './components/CookieConsent';
import { AnnouncementsProvider } from './features/announcements/AnnouncementsProvider';
import { FeedbackFAB } from './components/Navigation/FeedbackFAB';
import { BraveDetectDialog } from './components/Dialogs/BraveDetectDialog';
import { LoginDialog } from './components/Dialogs/LoginDialog';
import { MobileApp } from './components/Mobile/MobileApp';

// Pages
import { HomePage } from './components/Pages/HomePage';
import { LandingPage } from './components/Pages/LandingPage';
const VersionHistory = lazy(() => import('./components/VersionHistory').then(module => ({ 'default': module.VersionHistory })));
// Tutorial modal removed, replaced by page
// const Tutorial = lazy(() => import('./components/Tutorial').then(module => ({ 'default': module.Tutorial })));
const FavoritesManagerMain = lazy(() => import('./features/favorites/components/FavoritesManagerMain').then(module => ({ 'default': module.FavoritesManagerMain })));
// const FavoritesManager = lazy(() => import('./components/FavoritesManager').then(module => ({ 'default': module.FavoritesManager })));
const FeedbackModal = lazy(() => import('./features/feedback/FeedbackModal').then(module => ({ 'default': module.FeedbackModal })));
const AboutPage = lazy(() => import('./components/AboutPage').then(module => ({ 'default': module.AboutPage })));
const PrivacyPage = lazy(() => import('./components/PrivacyPage').then(module => ({ 'default': module.PrivacyPage })));
const CanvasPage = lazy(() => import('./components/Pages/NewCanvasPage').then(module => ({ 'default': module.NewCanvasPage })));
const InstructionsPage = lazy(() => import('./components/Pages/InstructionsPage').then(module => ({ 'default': module.InstructionsPage })));
const FAQPage = lazy(() => import('./components/FAQPage').then(module => ({ 'default': module.FAQPage })));
const NotFoundPage = lazy(() => import('./components/NotFoundPage').then(module => ({ 'default': module.NotFoundPage })));
const AdminPage = lazy(() => import('./features/admin/AdminPage').then(module => ({ 'default': module.AdminPage })));
const VTuberExplorePage = lazy(() => import('./features/vtuber/pages/VTuberExplorePage').then(module => ({ 'default': module.VTuberExplorePage })));
const AccountSettingsPage = lazy(() => import('./features/account/AccountSettingsPage').then(module => ({ 'default': module.AccountSettingsPage })));
const VtuberDetailPage = lazy(() => import('./features/recommendations/pages/VtuberDetailPage').then(module => ({ 'default': module.VtuberDetailPage })));

export default function App() {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  // 初始化 GA4
  useEffect(() => {
    initGA();
    logPageView();

    // Clear canvas items on page load
    useStreamStore.getState().clearCanvasItems();

    // Check for OAuth redirect (Twitch import or Supabase auth)
    if (window.location.hash && window.location.hash.includes('access_token')) {
      // 只在 Twitch 匯入流程（有 pending flag）時才開啟收藏管理
      const isTwitchImport = sessionStorage.getItem('twitch_import_pending');
      if (isTwitchImport) {
        useUIStore.getState().openModal('favorites');
      }

      // Auto-navigate back to the page user was on before OAuth
      // returnPath 可能含 lang prefix（例如 /zh-TW/canvas）；用 i18nRouting 解析子路徑
      const returnPath = sessionStorage.getItem(RETURN_PAGE_KEY);
      if (returnPath) {
        const { subpath } = parsePath(returnPath);
        const page = pathToPage(subpath);
        if (page !== 'not-found') {
          useUIStore.getState().setPage(page);
        }
        sessionStorage.removeItem(RETURN_PAGE_KEY);
      }
    }
  }, []);

  const theme = useEffectiveTheme();
  const toggleTheme = useUIStore(s => s.toggleTheme);
  const currentPage = useUIStore(s => s.page);
  const setCurrentPage = useUIStore(s => s.setPage);
  const modals = useUIStore(s => s.modals);
  const closeModal = useUIStore(s => s.closeModal);

  // Hooks
  useAppInitialization();
  useThemeSystem();
  useRouter();
  useAutoRefresh();
  useHotkeys();
  useEngagementTracking(); // GA4 使用時間追蹤
  useCanvasRetention(); // GA4: canvas 留存時間追蹤

  // YouTube Warning Logic State (Hook) - Remains Global
  const {
    showYTRiskDialog,
    currentYTRiskCount,
    setShowYTRiskDialog,
    handlePauseOtherYouTubeStreams,
    handleRiskDontRemind
  } = useYouTubeRisk();

  // Mobile: Render MobileApp for core tabs, but fall through for full pages
  const isFullPage = ['about', 'privacy', 'faq', 'instructions', 'admin', 'vtuber-explore', 'vtuber-detail', 'recommendations', 'not-found'].includes(currentPage);
  if (isMobile && !isFullPage && currentPage !== 'home') {
    return <MobileApp />;
  }

  // Routing Logic
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <LandingPage />;
      case 'tool':
        return <HomePage />;
      case 'canvas':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
            <CanvasPage />
          </Suspense>
        );
      case 'instructions':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
            <InstructionsPage />
          </Suspense>
        );
      case 'about':
        return (
          <>
            <SEO
              title={t('seo:about.title')}
              description={t('seo:about.description')}
              keywords={t('seo:about.keywords')}
              pathWithoutLang="/about"
            />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t('common.loading')}</div>}>
              <AboutPage
                theme={theme}
                onThemeToggle={toggleTheme}
                onBack={() => setCurrentPage('home')}
                onNavigateToPrivacy={() => setCurrentPage('privacy')}
              />
            </Suspense>
          </>
        );
      case 'privacy':
        return (
          <>
            <SEO
              title={t('seo:privacy.title')}
              description={t('seo:privacy.description')}
              keywords={t('seo:privacy.keywords')}
              pathWithoutLang="/privacy"
            />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t('common.loading')}</div>}>
              <PrivacyPage
                theme={theme}
                onThemeToggle={toggleTheme}
                onBack={() => setCurrentPage('home')}
                onNavigateToAbout={() => setCurrentPage('about')}
              />
            </Suspense>
          </>
        );
      case 'faq':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
            <FAQPage />
          </Suspense>
        );
      case 'admin':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
            <AdminPage />
          </Suspense>
        );
      case 'vtuber-explore':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
            <VTuberExplorePage initialTab="vtubers" />
          </Suspense>
        );
      case 'account':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
            <AccountSettingsPage />
          </Suspense>
        );
      case 'recommendations':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
            <VTuberExplorePage initialTab="recommendations" />
          </Suspense>
        );
      case 'vtuber-detail':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
            <VtuberDetailPage />
          </Suspense>
        );
      case 'not-found':
      default:
        return (
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t('common.loading')}</div>}>
            <NotFoundPage />
          </Suspense>
        );
    }
  };

  return (
    <>
      {/* Global SEO Default? */}
      {/* <SEO /> is inside pages now? HomePage has it. */}

      {/* Main Content */}
      {renderPage()}

      {/* Global Modals */}
      <HotkeyHelpDialog />


      {/* Tutorial modal removed */}

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

      <YouTubeRiskDialog
        open={showYTRiskDialog}
        streamCount={currentYTRiskCount}
        onClose={() => setShowYTRiskDialog(false)}
        onPauseOthers={handlePauseOtherYouTubeStreams}
        onDontRemind={handleRiskDontRemind}
      />

      <PerformanceOverlay />
      <GlobalLiveStatusChecker />
      <Toaster />
      <CookieConsent />
      <AnnouncementsProvider />
      <BraveDetectDialog />
      <LoginDialog
        open={modals.login}
        onClose={() => closeModal('login')}
      />
      {/* 全站浮動意見回饋按鈕 — admin / canvas 沉浸頁略過避免擋畫面 */}
      {currentPage !== 'admin' && currentPage !== 'canvas' && <FeedbackFAB />}
    </>
  );
}