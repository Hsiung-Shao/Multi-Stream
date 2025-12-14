import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { apiLoader } from "./utils/apiLoader.ts";
import { I18nProvider } from "./i18n/index";

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

// 設置占位符函數，確保在 React 應用載入之前，所有加入串流的功能都能立即使用
// 這個占位符函數會在 React 應用載入後被替換
if (typeof window !== 'undefined' && !(window as any).addStream) {
  // 保存占位符函數的引用
  const placeholderAddStream = async (url: string) => {
    // 等待 React 應用載入（最多等待 10 秒）
    const maxWaitTime = 10000;
    const checkInterval = 100;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      // 檢查 React 版本的 addStream 是否已經準備好
      // 注意：不能直接檢查 window.addStream，因為它可能還是占位符函數
      // 應該檢查 _reactAddStreamReady 標記
      if ((window as any)._reactAddStreamReady === true && (window as any).addStream !== placeholderAddStream) {
        // React 版本已準備好，調用它
        return await (window as any).addStream(url);
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    // 如果等待超時，顯示錯誤提示
    alert('錯誤：React 應用尚未載入，無法創建串流容器。請稍候片刻後再試，或重新整理頁面。');
  };
  
  (window as any).addStream = placeholderAddStream;
  
  // 設置標記，表明這是占位符函數（React 版本會將此標記設為 true）
  (window as any)._reactAddStreamReady = false;
}

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
  