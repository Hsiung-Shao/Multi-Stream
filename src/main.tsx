import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { apiLoader } from "./utils/apiLoader.ts";
import { I18nProvider } from "./i18n/index";

// 載入必要的播放器 API（應用啟動時立即載入）
apiLoader.loadAllPlayerApis().then(() => {
  console.log('[main.tsx] 播放器 API 載入完成');
}).catch((error) => {
  console.error('[main.tsx] 播放器 API 載入失敗:', error);
});

// 數據 API 將在需要時按需載入（例如搜尋功能、開台狀態查詢等）

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
  