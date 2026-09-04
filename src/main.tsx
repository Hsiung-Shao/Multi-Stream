import { createRoot, hydrateRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App, { preloadPageChunks } from "./App.tsx";
import "./index.css";
import { apiLoader } from "./utils/apiLoader.ts";
import i18n, { ensureLanguageLoaded, toHtmlLang } from "./i18n/i18n"; // Import i18n configuration
import { useUIStore } from "./store/useUIStore";
import { checkAppVersion } from "./utils/versionCheck.ts";
import { tagsService } from "./features/favorites/TagsService";

// Perform version check and cleanup BEFORE anything else
checkAppVersion();

// Initialize Tags (Defaults + Migration)
tagsService.initializeDefaults();

// 播放器 API 預熱：
// - Landing 首頁（'/'）不需要任何播放器，預熱會在首屏載入外部腳本（Twitch/YouTube），
//   嚴重拖累 FCP/LCP，因此 landing 完全略過。
// - 其他頁面延遲到瀏覽器空閒時才預熱，避免與初始渲染競爭主執行緒/網路；
//   真正需要時 apiLoader 仍會自行按需載入（不影響功能）。
const schedulePrewarm = (cb: () => void) => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(cb, { timeout: 3000 });
  } else {
    setTimeout(cb, 2000);
  }
};

if (window.location.pathname !== '/') {
  // preconnect 從 index.html 移到這裡：首頁不需要播放器，靜態 preconnect 是純浪費。
  // 這行要立刻執行（不進 idle），連線才來得及在真正載播放器之前握手完成。
  const preconnect = document.createElement('link');
  preconnect.rel = 'preconnect';
  preconnect.href = 'https://player.twitch.tv';
  preconnect.crossOrigin = '';
  document.head.appendChild(preconnect);

  schedulePrewarm(() => {
    apiLoader.loadTwitchPlayerApi().catch(() => {
      // 預熱失敗，將在需要時重試
    });
    apiLoader.loadYouTubePlayerApi().catch(() => {
      // 預熱失敗，將在需要時重試
    });
  });
}

// 數據 API 將在需要時按需載入（例如搜尋功能、開台狀態查詢等）



const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * 能不能直接 hydrate 預渲染的 HTML（scripts/prerender.mjs 產出，經 functions/[[path]].js 送達）？
 * 條件缺一不可，否則清空 #root 走 createRoot（/canvas、404、沒預渲染的路徑本來就是空殼）：
 *   1. #root 有內容且 <html data-prerender-lang> 存在（= 這份 HTML 是預渲染的）
 *   2. 烘進去的語言 == 使用者實際語言（localStorage/navigator 偵測；ja/ko/zh-CN 使用者一律不符）
 *   3. store theme == 烘進去的主題（entry-server 固定烘站方預設 'dark'；使用者改過主題就不符）
 * 語言或主題不符時 hydrate 會 mismatch → React 丟掉整棵樹重畫並在 console 報錯，不如一開始就 createRoot。
 */
const canHydrate = (root: HTMLElement): boolean => {
  const baked = document.documentElement.dataset.prerenderLang;
  if (!baked || !root.hasChildNodes()) return false;
  const bakedTheme = document.documentElement.dataset.prerenderTheme;
  return baked === toHtmlLang(i18n.language) && bakedTheme === useUIStore.getState().theme;
};

// 偵測到的語言若為 lazy（zh-CN/ja/ko），先載入其資源再 render，避免 fallback 閃爍；
// eager 語言（zh-TW/en，含 Lighthouse 偵測到的 en）會立即 resolve，不增加首屏延遲。
ensureLanguageLoaded(i18n.language).finally(() => {
  const root = document.getElementById("root")!;
  const app = (
    <QueryClientProvider client={queryClient}>
      {/* <I18nProvider> removed, using global i18next instance */}
      <App />
      {/* </I18nProvider> */}
    </QueryClientProvider>
  );
  if (canHydrate(root)) {
    // 先把當頁與 DeferredGlobals 的 chunk 載好再 hydrate：否則 lazy 邊界會留在 dehydrated 狀態，
    // 隨後 zustand client snapshot ≠ server snapshot 的同步更新會逼 React 放棄 hydrate（#421）而閃 Loading。
    // 預渲染 HTML 已經畫在畫面上，這段等待不影響首屏。
    preloadPageChunks(useUIStore.getState().page).then(() => hydrateRoot(root, app));
  } else {
    root.replaceChildren();
    createRoot(root).render(app);
  }
});
