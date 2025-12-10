
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./index.css";
  import { loadAllPlayerApis } from "./utils/loadPlayerApis.ts";

  // 載入播放器 API
  loadAllPlayerApis().then(() => {
    console.log('播放器 API 載入完成');
  }).catch((error) => {
    console.error('播放器 API 載入失敗:', error);
  });

  createRoot(document.getElementById("root")!).render(<App />);
  