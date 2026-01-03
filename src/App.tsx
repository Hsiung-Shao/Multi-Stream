import { lazy, Suspense, useEffect } from 'react';
import { useUIStore } from './store/useUIStore';
import { useStreamStore } from './store/useStreamStore';
import { useYouTubeRisk } from './hooks/useYouTubeRisk';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useThemeSystem } from './hooks/useThemeSystem';
import { useRouter } from './hooks/useRouter';
import { initGA, logPageView } from './utils/analytics';
import { SEO } from './components/SEO'; // Default SEO for App? Or remove?
import { YouTubeRiskDialog } from './components/YouTubeRiskDialog';

// Pages
import { HomePage } from './components/Pages/HomePage';
const VersionHistory = lazy(() => import('./components/VersionHistory').then(module => ({ 'default': module.VersionHistory })));
const Tutorial = lazy(() => import('./components/Tutorial').then(module => ({ 'default': module.Tutorial })));
const FavoritesManager = lazy(() => import('./components/FavoritesManager').then(module => ({ 'default': module.FavoritesManager })));
const FeedbackModal = lazy(() => import('./features/feedback/FeedbackModal').then(module => ({ 'default': module.FeedbackModal })));
const AboutPage = lazy(() => import('./components/AboutPage').then(module => ({ 'default': module.AboutPage })));
const PrivacyPage = lazy(() => import('./components/PrivacyPage').then(module => ({ 'default': module.PrivacyPage })));
const CanvasPage = lazy(() => import('./components/Pages/CanvasPage').then(module => ({ 'default': module.CanvasPage })));
const FixedPage = lazy(() => import('./components/Pages/FixedPage').then(module => ({ 'default': module.FixedPage })));
const NotFoundPage = lazy(() => import('./components/NotFoundPage').then(module => ({ 'default': module.NotFoundPage })));

export default function App() {
  // 初始化 GA4
  useEffect(() => {
    initGA();
    logPageView();

    // Clear canvas items on page load
    useStreamStore.getState().clearCanvasItems();

    // Check for Twitch OAuth redirect
    if (window.location.hash && window.location.hash.includes('access_token')) {
      useUIStore.getState().openModal('favorites');
    }
  }, []);

  const theme = useUIStore(s => s.theme);
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

  // YouTube Warning Logic State (Hook) - Remains Global
  const {
    showYTRiskDialog,
    currentYTRiskCount,
    setShowYTRiskDialog,
    handlePauseOtherYouTubeStreams,
    handleRiskDontRemind
  } = useYouTubeRisk();

  // Routing Logic
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'canvas':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">載入畫布...</div>}>
            <CanvasPage />
          </Suspense>
        );
      case 'fixed':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">載入佈局...</div>}>
            <FixedPage />
          </Suspense>
        );
      case 'about':
        return (
          <>
            <SEO
              title="關於我們 - MultiStream Hub"
              description="了解 MultiStream Hub 的功能特色、技術架構和開發者資訊。一個完全免費的多平台直播串流觀看工具，支援 Twitch 和 YouTube。"
              keywords="關於 MultiStream Hub, 功能特色, 技術架構, 開發者資訊, 多平台直播工具"
              url="https://multistreaming.org/about"
            />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center">載入中...</div>}>
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
              title="隱私權政策 - MultiStream Hub"
              description="MultiStream Hub 隱私權政策。了解我們如何保護您的隱私，以及我們收集和使用資料的方式。本網站為純前端工具，絕大多數資料僅儲存於您的瀏覽器本地。"
              keywords="隱私權政策, 隱私保護, 資料安全, MultiStream Hub, 個人資料保護"
              url="https://multistreaming.org/privacy"
            />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center">載入中...</div>}>
              <PrivacyPage
                theme={theme}
                onThemeToggle={toggleTheme}
                onBack={() => setCurrentPage('home')}
                onNavigateToAbout={() => setCurrentPage('about')}
              />
            </Suspense>
          </>
        );
      case 'not-found':
      default:
        return (
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center">載入中...</div>}>
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
      {modals.history && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
          <VersionHistory
            theme={theme}
            onClose={() => closeModal('history')}
          />
        </Suspense>
      )}

      {modals.tutorial && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
          <Tutorial
            theme={theme}
            onClose={() => closeModal('tutorial')}
          />
        </Suspense>
      )}

      {modals.favorites && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
          <FavoritesManager
            theme={theme}
            onClose={() => closeModal('favorites')}
          />
        </Suspense>
      )}

      {modals.feedback && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
          <FeedbackModal
            theme={theme}
            onClose={() => closeModal('feedback')}
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
    </>
  );
}