import { lazy, Suspense, useEffect, useState } from 'react';
import { useIsMobile } from './hooks/useIsMobile';
import { useTranslation } from 'react-i18next';
import { useUIStore } from './store/useUIStore';
import { PAGE_PATHS, pathToPage } from './config/routes';
import { GUIDE_META, GUIDE_SLUGS, guidePath, guideSlugOf, isGuidePage } from './config/guides';
import { SEO_SITE_URL } from './seo/defaults';
import { graph, breadcrumb, webPage, techArticle, ORG_ID, GUIDES_DATE_MODIFIED, type WebPageType } from './seo/jsonld';
import { toHtmlLang } from './i18n/i18n';
import { useStreamStore } from './store/useStreamStore';
import { useYouTubeRisk } from './hooks/useYouTubeRisk';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useThemeSystem } from './hooks/useThemeSystem';
import { useRouter } from './hooks/useRouter';
import { RETURN_PAGE_KEY } from './hooks/useTwitchAuth';
import { initGA, logPageView } from './utils/analytics';
import { userSegmentationManager } from './utils/userSegmentation';
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
  const { t, i18n } = useTranslation();
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
        // 與 useRouter 共用 routes.ts 的對照表（含 /instructions/<slug>），未知路徑不導頁
        const page = pathToPage(returnPath);
        if (page !== 'not-found') {
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
  useCanvasRetention(); // canvas 活動時間記錄（短暫播放回復用）

  // YouTube Warning Logic State (Hook) - Remains Global
  const {
    showYTRiskDialog,
    currentYTRiskCount,
    setShowYTRiskDialog,
    handlePauseOtherYouTubeStreams,
    handleRiskDontRemind
  } = useYouTubeRisk();

  // Mobile: Render MobileApp for core tabs, but fall through for full pages
  // （教學文章頁 instructions:<slug> 也走桌機版 InstructionsPage，靠其 CSS media query 收斂）
  const isFullPage = ['about', 'privacy', 'faq', 'instructions', 'support', 'admin', 'not-found'].includes(currentPage)
    || isGuidePage(currentPage);
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

  // JSON-LD 用的語言碼（與 <html lang> 同步）
  const inLanguage = toHtmlLang(i18n.language);
  // 靜態頁共用：頁面節點（WebPage 子型別）+ 首頁 › 本頁 麵包屑
  const staticPageJsonLd = (
    page: 'about' | 'privacy' | 'support',
    type: WebPageType,
    crumbName: string,
    extra?: Record<string, unknown>,
  ) => graph(
    webPage({ type, path: PAGE_PATHS[page], name: tx(`seo:${page}.title`), description: tx(`seo:${page}.description`), inLanguage, extra }),
    breadcrumb([{ name: 'MultiStream Hub', path: '/' }, { name: crumbName, path: PAGE_PATHS[page] }]),
  );

  // Routing Logic
  const renderPage = () => {
    // 教學列表 + 7 篇文章共用 InstructionsPage；<SEO> 放 Suspense 外，切頁瞬間 title/meta 就正確
    // （useRouter 的 GA4 pageview 讀 document.title，不能等 lazy chunk）。文章頁用該篇專屬的
    // seo:instructions.<slug>.* 與 og:type=article。
    if (currentPage === 'instructions' || isGuidePage(currentPage)) {
      const slug = isGuidePage(currentPage) ? guideSlugOf(currentPage) : null;
      const path = slug ? guidePath(slug) : PAGE_PATHS.instructions;
      const title = tx(slug ? `seo:instructions.${slug}.title` : 'seo:instructions.title');
      const description = tx(slug ? `seo:instructions.${slug}.description` : 'seo:instructions.description');
      const hubCrumbs = [{ name: 'MultiStream Hub', path: '/' }, { name: tx('tutorial:title'), path: PAGE_PATHS.instructions }];
      const jsonLd = slug
        ? graph(
          techArticle({
            path,
            headline: title.replace(/\s*-\s*MultiStream Hub$/, ''),
            description,
            image: `${SEO_SITE_URL}${GUIDE_META[slug].image}`,
            inLanguage,
            datePublished: GUIDE_META[slug].datePublished,
            dateModified: GUIDES_DATE_MODIFIED,
          }),
          breadcrumb([...hubCrumbs, { name: title.replace(/\s*-\s*MultiStream Hub$/, ''), path }]),
        )
        : graph(
          webPage({
            type: 'CollectionPage', path, name: title, description, inLanguage,
            extra: { hasPart: GUIDE_SLUGS.map((s) => ({ '@id': `${SEO_SITE_URL}${guidePath(s)}#article` })) },
          }),
          breadcrumb(hubCrumbs),
        );
      return (
        <>
          <SEO
            title={title}
            description={description}
            url={`${SEO_SITE_URL}${path}`}
            type={slug ? 'article' : 'website'}
            image={slug ? `${SEO_SITE_URL}${GUIDE_META[slug].image}` : undefined}
            jsonLd={jsonLd}
          />
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
            <InstructionsPage />
          </Suspense>
        </>
      );
    }
    switch (currentPage) {
      case 'home':
        return <LandingPage />;
      case 'canvas':
        return (
          <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">{t('common.loading')}</div>}>
            <CanvasPage />
          </Suspense>
        );
      case 'about':
        return (
          <>
            <SEO
              title={tx('seo:about.title')}
              description={tx('seo:about.description')}
              url={`${SEO_SITE_URL}${PAGE_PATHS.about}`}
              jsonLd={staticPageJsonLd('about', 'AboutPage', tx('about:title'), {
                mainEntity: { '@id': ORG_ID },
              })}
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
              url={`${SEO_SITE_URL}${PAGE_PATHS.privacy}`}
              jsonLd={staticPageJsonLd('privacy', 'WebPage', tx('privacy:title'))}
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
              url={`${SEO_SITE_URL}${PAGE_PATHS.support}`}
              jsonLd={staticPageJsonLd('support', 'WebPage', tx('support:title'))}
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