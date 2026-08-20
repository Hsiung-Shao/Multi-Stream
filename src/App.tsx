import { lazy, Suspense, useEffect, useState } from 'react';
import { useIsMobile } from './hooks/useIsMobile';
import { useTranslation } from 'react-i18next';
import { useUIStore, type PageType } from './store/useUIStore';
import { useStreamStore } from './store/useStreamStore';
import { useYouTubeRisk } from './hooks/useYouTubeRisk';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useThemeSystem } from './hooks/useThemeSystem';
import { useRouter } from './hooks/useRouter';
import { RETURN_PAGE_KEY } from './hooks/useTwitchAuth';
import { initGA, logPageView } from './utils/analytics';
import { userSegmentationManager } from './utils/userSegmentation';
import { initUmami } from './utils/umami';
import { useCanvasRetention } from './hooks/useCanvasRetention';
import { useAppliedTheme } from './hooks/useAppliedTheme';
import { SEO } from './components/SEO'; // Default SEO for App? Or remove?
import { YouTubeRiskDialog } from './components/YouTubeRiskDialog';
import { useHotkeys } from './hooks/useHotkeys';
import { useStreamHeartbeat } from './hooks/useStreamHeartbeat';
import { RestoreSessionPrompt } from './components/Dialogs/RestoreSessionPrompt';
import type { StreamData } from './utils/streamUtils';
import type { CanvasItem } from './types/canvas';
import { MobileApp } from './components/Mobile/MobileApp';

// Pages
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
const SupportPage = lazy(() => import('./components/SupportPage').then(module => ({ 'default': module.SupportPage })));
const NotFoundPage = lazy(() => import('./components/NotFoundPage').then(module => ({ 'default': module.NotFoundPage })));
const AdminPage = lazy(() => import('./features/admin/AdminPage').then(module => ({ 'default': module.AdminPage })));
// 全站常駐但非首屏所需的全域元件，集中為單一 lazy chunk（見 DeferredGlobals.tsx）
const DeferredGlobals = lazy(() => import('./components/DeferredGlobals'));

export default function App() {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  // i18next 此版型別不接受 'ns:key' 前綴字串，沿用專案慣例（InstructionsPage/FAQPage）以 cast 繞過
  const tx = t as unknown as (key: string, options?: Record<string, unknown>) => string;

  // 短暫播放回復:待使用者確認是否恢復的上次工作階段
  const [pendingRestore, setPendingRestore] = useState<{
    streams: StreamData[];
    canvasItems: CanvasItem[];
    layoutMode: 'auto' | 'canvas';
  } | null>(null);

  const handleRestoreSession = () => {
    if (pendingRestore) {
      useStreamStore.getState().restoreSession(pendingRestore);
      if (useUIStore.getState().page !== 'canvas') useUIStore.getState().setPage('canvas');
    }
    setPendingRestore(null);
  };
  const handleDiscardSession = () => setPendingRestore(null);

  // 初始化 GA4
  useEffect(() => {
    // initGA 為 async(需動態載入 gtag.js):必須等初始化完成(進 live/mock)
    // 才送 page_view 與分群 user_properties,否則 mode 仍 uninitialized 會被丟棄。
    initGA().then(() => {
      userSegmentationManager.init();
      logPageView();
    });
    initUmami();

    // 短暫播放回復:啟動時若「10 分鐘內」上次有未關閉的串流,暫存並彈提示詢問是否恢復;
    // 過期(或無串流)則維持「清空畫布」的既有行為。
    {
      const { streams, canvasItems, layoutMode, lastActiveAt } = useStreamStore.getState();
      if (streams.length > 0) {
        const withinWindow = Date.now() - lastActiveAt <= 10 * 60 * 1000;
        if (withinWindow) {
          setPendingRestore({ streams, canvasItems, layoutMode });
        }
        useStreamStore.getState().clearCanvasItems();
      }
    }

    // Check for Twitch OAuth redirect
    if (window.location.hash && window.location.hash.includes('access_token')) {
      useUIStore.getState().openModal('favorites');

      // Auto-navigate back to the page user was on before OAuth
      const returnPath = sessionStorage.getItem(RETURN_PAGE_KEY);
      if (returnPath) {
        const pathToPage: Record<string, PageType> = {
          '/canvas': 'canvas',
          '/about': 'about',
          '/instructions': 'instructions',
          '/faq': 'faq',
        };
        const page = pathToPage[returnPath];
        if (page) {
          useUIStore.getState().setPage(page);
        }
        sessionStorage.removeItem(RETURN_PAGE_KEY);
      }
    }
  }, []);

  // 用「實際套用」的主題(admin 強制深色),讓 theme prop 與 documentElement class 永遠一致,
  // 避免在 /admin 開啟全域 modal(hotkey)時出現淺色面板疊在深色後台上
  const theme = useAppliedTheme();
  const toggleTheme = useUIStore(s => s.toggleTheme);
  const currentPage = useUIStore(s => s.page);
  const modals = useUIStore(s => s.modals);
  const closeModal = useUIStore(s => s.closeModal);

  // Hooks
  useAppInitialization();
  useThemeSystem();
  useRouter();
  useAutoRefresh();
  useHotkeys();
  useStreamHeartbeat(); // GA4 stream-aware 觀看時間追蹤（取代 useEngagementTracking，spec 對齊）
  useCanvasRetention(); // Umami canvas 留存追蹤

  // YouTube Warning Logic State (Hook) - Remains Global
  const {
    showYTRiskDialog,
    currentYTRiskCount,
    setShowYTRiskDialog,
    handlePauseOtherYouTubeStreams,
    handleRiskDontRemind
  } = useYouTubeRisk();

  // Mobile: Render MobileApp for core tabs, but fall through for full pages
  const isFullPage = ['about', 'privacy', 'faq', 'instructions', 'support', 'admin', 'not-found'].includes(currentPage);
  if (isMobile && !isFullPage && currentPage !== 'home') {
    return (
      <>
        <MobileApp />
        <RestoreSessionPrompt
          open={!!pendingRestore}
          streamCount={pendingRestore?.streams.length ?? 0}
          onRestore={handleRestoreSession}
          onDiscard={handleDiscardSession}
        />
      </>
    );
  }

  // Routing Logic
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <LandingPage />;
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
              title={tx('seo:about.title')}
              description={tx('seo:about.description')}
              url="https://multistreaming.org/about"
            />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t('common.loading')}</div>}>
              <AboutPage />
            </Suspense>
          </>
        );
      case 'privacy':
        return (
          <>
            <SEO
              title={tx('seo:privacy.title')}
              description={tx('seo:privacy.description')}
              url="https://multistreaming.org/privacy"
            />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t('common.loading')}</div>}>
              <PrivacyPage
                theme={theme}
                onThemeToggle={toggleTheme}
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
      case 'support':
        return (
          <>
            <SEO
              title={tx('seo:support.title')}
              description={tx('seo:support.description')}
              url="https://multistreaming.org/support"
            />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t('common.loading')}</div>}>
              <SupportPage />
            </Suspense>
          </>
        );
      case 'admin':
        return (
          <>
            {/* 後台不進索引；_headers 另有 /admin X-Robots-Tag 作伺服器層保險 */}
            <SEO noindex title="Admin - MultiStream Hub" />
            <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
              <AdminPage />
            </Suspense>
          </>
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
      {/* Main Content */}
      {renderPage()}

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

      <RestoreSessionPrompt
        open={!!pendingRestore}
        streamCount={pendingRestore?.streams.length ?? 0}
        onRestore={handleRestoreSession}
        onDiscard={handleDiscardSession}
      />

      {/* 常駐但非首屏所需的全域元件，延後載入以縮小首屏 entry（見 DeferredGlobals.tsx） */}
      <Suspense fallback={null}>
        <DeferredGlobals />
      </Suspense>
    </>
  );
}