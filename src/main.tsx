import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { apiLoader } from "./utils/apiLoader.ts";
import { I18nProvider } from "./i18n/index";

// 優化：只預載入 Twitch Player API（不等待完成，不阻塞應用啟動）
// YouTube API 將在需要時按需載入
apiLoader.loadTwitchPlayerApi().catch((error) => {
  console.warn('[main.tsx] Twitch Player API 預載入失敗（將在需要時重試）:', error);
});

// 數據 API 將在需要時按需載入（例如搜尋功能、開台狀態查詢等）

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
  