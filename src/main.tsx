import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { apiLoader } from "./utils/apiLoader.ts";
import { I18nProvider } from "./i18n/index";

// 優化：立即開始載入 Twitch Player API（不等待其他資源）
// 這樣可以在 React 應用初始化時就開始載入，減少等待時間
apiLoader.loadTwitchPlayerApi().then(() => {
  console.log('[main.tsx] Twitch Player API 載入完成');
}).catch((error) => {
  console.error('[main.tsx] Twitch Player API 載入失敗:', error);
});

// YouTube API 可以並行載入或按需載入
apiLoader.loadYouTubePlayerApi().then(() => {
  console.log('[main.tsx] YouTube Player API 載入完成');
}).catch((error) => {
  console.error('[main.tsx] YouTube Player API 載入失敗:', error);
});

// 數據 API 將在需要時按需載入（例如搜尋功能、開台狀態查詢等）

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
  