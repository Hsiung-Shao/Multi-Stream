import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";
import { apiLoader } from "./utils/apiLoader.ts";
import { I18nProvider } from "./i18n/index";
import { checkAppVersion } from "./utils/versionCheck.ts";
import { tagsService } from "./features/favorites/TagsService";

// Perform version check and cleanup BEFORE anything else
checkAppVersion();

// Initialize Tags (Defaults + Migration)
tagsService.initializeDefaults();

// 優化：只預載入 Twitch Player API（不等待完成，不阻塞應用啟動）
// YouTube API 將在需要時按需載入
apiLoader.loadTwitchPlayerApi().catch((error) => {
  // Twitch Player API 預載入失敗，將在需要時重試
});

// YouTube API 可以並行載入或按需載入
apiLoader.loadYouTubePlayerApi().catch((error) => {
  // YouTube Player API 載入失敗，將在需要時重試
});

// 數據 API 將在需要時按需載入（例如搜尋功能、開台狀態查詢等）



const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <App />
    </I18nProvider>
  </QueryClientProvider>
);
