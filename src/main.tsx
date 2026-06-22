import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";
import { apiLoader } from "./utils/apiLoader.ts";
import i18n, { ensureLanguageLoaded } from "./i18n/i18n"; // Import i18n configuration
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

// 偵測到的語言若為 lazy（zh-CN/ja/ko），先載入其資源再 render，避免 fallback 閃爍；
// eager 語言（zh-TW/en，含 Lighthouse 偵測到的 en）會立即 resolve，不增加首屏延遲。
ensureLanguageLoaded(i18n.language).finally(() => {
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      {/* <I18nProvider> removed, using global i18next instance */}
      <App />
      {/* </I18nProvider> */}
    </QueryClientProvider>
  );
});
