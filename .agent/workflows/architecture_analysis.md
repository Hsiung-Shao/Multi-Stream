---
description: 分析專案整體架構並更新 PROJECT_ARCHITECTURE.md
---

1. **收集專案資訊**
   - 讀取 `package.json` 了解依賴與專案類型。
   - 讀取根目錄下的 Config 檔案 (如 `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`) 了解建置與開發設定。
   - 使用 `list_dir` 列出專案根目錄與 `src` 目錄下的結構。

2. **深入架構分析**
   - **進入點與路由**: 分析 `src/main.tsx` (或 `index.tsx`), `src/App.tsx` 以及路由設定。
   - **狀態管理**: 檢查 `src/store` (若存在) 或其他狀態管理實作 (Context, Redux, Zustand)，了解 Global State 設計。
   - **功能模組**: 分析 `src/features` 目錄 (若存在)，或 `src/components` 中的主要功能區塊，識別核心業務邏輯。
   - **工具與服務**: 檢查 `src/services`, `src/utils`, `src/hooks`, `src/api` 等目錄，了解共用邏輯與 API 互動方式。
   - **樣式系統**: 確認 CSS 架構 (Tailwind, CSS Modules, Styled Components 等)。

3. **生成或更新架構文件**
   - 根據以上分析，在專案根目錄生成或覆蓋寫入 `PROJECT_ARCHITECTURE.md`。
   - **語言規範**: 必須使用 **繁體中文**。
   - **文件結構建議**:
     - **# 專案架構文件 (Project Architecture)**
       - **專案概述**: 簡述專案目標與核心技術棧。
     - **## 目錄結構說明**: 以樹狀圖或列表說明重要目錄的用途。
     - **## 核心架構設計**:
       - **UI 框架**: 元件庫、CSS 方案。
       - **狀態管理**: Store 的劃分與職責。
       - **路由設計**: 頁面結構。
     - **## 功能模組 (Features)**: 列出主要功能模組及其職責。
     - **## 關鍵檔案**: 列出值得注意的檔案 (如 Entry Point, Global Config)。
     - **## 開發規範 (推斷)**: 根據代碼風格推斷的命名或結構規範。

4. **完成**
   - 通知使用者架構分析已完成，並請他們查看 `PROJECT_ARCHITECTURE.md`。
