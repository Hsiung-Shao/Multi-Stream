# MultiStream Hub

一個免費的多平台直播串流觀看工具，支援同時觀看多個 Twitch 和 YouTube 直播，提供多種布局模式、聊天室整合、音量控制和強大的收藏管理功能。

🌐 **線上版本**: [https://multistreaming.org/](https://multistreaming.org/)

## ✨ 主要功能

### 🎥 多平台串流支援

- **Twitch** 直播串流嵌入
- **YouTube** 直播串流嵌入
- 支援同時觀看多個串流，無縫切換

### 🎨 布局模式

- **基本布局**：
  - 單一畫面
  - 左右分割
  - 上下分割
  - 四宮格
  - 上大下三
  - 2×3 網格
  - 3×3 網格
- **側邊聊天布局**：
  - **雙欄聊天布局**：左側視頻區域（可調整布局）+ 右側固定兩個聊天室（左右排列）
  - **四格聊天布局**：左側視頻區域（可調整布局）+ 右側固定四個聊天室（2×2 網格排列）
- 自動布局切換（根據串流數量智能調整）

### 💬 聊天室整合

- **Twitch** 聊天室嵌入
- **YouTube** 聊天室嵌入（完整支援 `embed_domain`）
- 聊天室顯示/隱藏控制
- 一鍵顯示所有聊天室
- 支援在側邊欄模式下快速切換不同串流的聊天室

### 🔊 音量控制

- 獨立音量控制（每個串流單獨調整）
- 總音量控制（統一調整所有串流）
- GLOBAL MUTE 全部靜音功能

### ⭐ 收藏系統與多標籤管理

- **我的最愛**：一鍵收藏常看頻道
- **多標籤體系**：支援為收藏的頻道添加多個標籤 (Tags)，方便靈活分類
- **分類管理**：自訂分類資料夾，整理大量收藏
- **快速載入**：
  - 一鍵載入單個收藏串流
  - 一鍵載入分類內所有串流
  - 透過標籤篩選快速尋找特定類型直播
- **本地備份**：支援匯出/匯入設定與收藏資料 (JSON 格式)

### 🎛️ 控制面板

- 固定側邊欄設計，滑鼠懸停自動展開
- 串流順序管理（拖曳排序）
- 即時版本紀錄查看

### 🔒 安全性

- XSS 防護
- URL 和 ID 嚴格驗證
- Content Security Policy (CSP) 與 Cloudflare Headers 整合
- 隱私導向：無需註冊，資料全本地存儲

### 📊 其他功能

- SEO 優化（Meta 標籤、結構化數據）
- 響應式設計 (RWD)
- 拖曳調整串流視窗大小
- 完整的多語言支援 (繁中/簡中/英/日/韓)

## 🚀 快速開始

### 本地開發

本專案採用 **React** + **Vite** 構建，請使用 Node.js 環境運行。

1. **Clone 專案**

   ```bash
   git clone https://github.com/Hsiung-Shao/Multi-Stream.git
   cd multi-stream
   ```

2. **安裝依賴**

   ```bash
   npm install
   ```

3. **啟動開發伺服器**

   ```bash
   npm run dev
   ```

   伺服器啟動後，請在瀏覽器中訪問終端機顯示的 URL (通常為 `http://localhost:5173`)。

4. **構建生產版本**

   ```bash
   npm run build
   ```

### 部署

#### Cloudflare Pages（推薦）

1. 將專案推送到 GitHub
2. 在 Cloudflare Pages 中連接 GitHub 倉庫
3. 選擇專案目錄
4. **Build command**: `npm run build`
5. **Build output directory**: `dist`
6. 部署！

## 📁 專案結構

```
multi-stream/
├── index.html              # 入口 HTML
├── public/                 # 靜態資源 (icon, robots.txt, etc.)
├── src/
│   ├── components/         # UI 組件 (Shadcn/UI, Layouts)
│   ├── features/           # 主要功能模組 (Chat, Stream, Settings)
│   ├── hooks/              # Custom React Hooks
│   ├── store/              # Zustand 狀態管理
│   ├── utils/              # 工具函數
│   ├── types/              # TypeScript 類型定義
│   ├── App.tsx             # 主應用組件
│   └── main.tsx            # 應用入口點
├── vite.config.ts          # Vite 配置
└── package.json            # 專案依賴與腳本
```

## 🛠️ 技術棧

- **核心框架**: [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **建構工具**: [Vite](https://vitejs.dev/)
- **樣式系統**: [TailwindCSS](https://tailwindcss.com/) + [Shadcn/UI](https://ui.shadcn.com/)
- **狀態管理**: [Zustand](https://github.com/pmndrs/zustand)
- **非同步資料**: [TanStack Query](https://tanstack.com/query/latest)
- **部署平台**: Cloudflare Pages

## 📝 使用說明

### 添加串流

1. 在控制面板輸入 Twitch/YouTube 網址或頻道 ID。
2. 點擊「加入畫面」。

### 調整布局

- 使用頂部或側邊欄的布局按鈕切換單螢幕、分割或網格模式。
- **側邊聊天模式**：適合需要同時關注多個聊天室的場景，右側固定顯示 2 或 4 個聊天視窗。

### 管理收藏

- 點擊「管理收藏」開啟管理器。
- 可新增、編輯收藏，並設定 **標籤 (Tags)** 與 **分類**。
- 支援透過標籤快速篩選顯示的收藏項目。

## 🔧 配置

### Google Analytics & AdSense

專案內建 GA4 與 AdSense 整合代碼，位於 `index.html` 與相關組件中。如需自行部署，請替換相關 ID。

## 📄 授權

**© 2025 Hsiung-Shao. All rights reserved.**

本專案供學習與個人使用。**專案不得複製經修改營利**。
歡迎分享連結給朋友！只要保留本專案連結即可，其餘隨意改、隨意用（非營利前提下）。

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！
如果您喜歡這個工具，歡迎加入我們的 [Discord](https://discord.gg/47kauArepY) 或給予星星支持！

## 📞 意見回饋

如有任何問題或建議，請透過[意見回饋表單](https://forms.gle/AjG922YrXFbyAdBa6)聯繫。

## 📚 版本紀錄

### v2.2.0 (2026-01-XX)

- 全面重構為 React + TypeScript 架構
- 引入 Shadcn/UI 與 TailwindCSS
- 新增多標籤 (Multi-Tags) 管理系統
- 優化 YouTube 檢測與聊天室整合

### v1.7.1 (2025-12-06)

- 修復 Youtube 連結導向排定直播問題
- 修復 Youtube 重新導向後會有年齡限制問題

### v1.3.0

- 新增側邊聊天布局功能（雙欄版和四格版）
- 優化布局切換與選擇器響應

---
Made with ❤️ by Hsiung-Shao
