# 專案架構文件 (Project Architecture)

## 專案概述

本專案 (Redesign Navbar) 是一個基於 **React** 與 **Vite** 的現代化網頁應用程式，專注於多串流觀看體驗 (Multi-Stream)。專案採用 **TypeScript** 進行開發，並使用 **Tailwind CSS** 與 **Shadcn UI** (Radix UI) 打造響應式與現代化的使用者介面。

核心技術棧：

- **Frontend Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS, Shadcn UI (Radix UI)
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Internationalization**: i18next
- **Drag & Drop**: @dnd-kit, @hello-pangea/dnd

## 目錄結構說明

```
src/
├── components/     # 通用 UI 元件 (Atomic Components, Shadcn UI)
├── config/         # 專案設定檔 (Constants, Environment config)
├── features/       # 功能模組 (以業務邏輯劃分)
│   ├── analytics/  # 數據分析功能
│   ├── backup/     # 備份與還原功能
│   ├── favorites/  # 收藏管理與設定功能
│   ├── feedback/   # 意見回饋功能
│   └── twitch/     # Twitch 整合相關功能
├── hooks/          # Custom React Hooks
├── i18n/           # 多國語系設定與翻譯檔
├── store/          # 全域狀態管理 (Zustand Stores)
├── types/          # TypeScript 型別定義
├── utils/          # 共用工具函式 (Helpers)
├── App.tsx         # 主應用程式元件 (路由與佈局入口)
└── main.tsx        # 應用程式進入點 (Mount Point)
```

## 核心架構設計

### 1. UI 框架與樣式

- **Component Library**: 主要使用 **Shadcn UI** (基於 Radix UI Primitives) 建構無障礙且可客製化的元件。
- **Styling**: 使用 **Tailwind CSS** 進行 Utility-first 的樣式開發，支援 Dark Mode。
- **Layout**: 採用 Flexbox 與 Grid 佈局，並透過 `@dnd-kit` 實現視窗拖拉與排列功能。

### 2. 狀態管理 (State Management)

專案使用 **Zustand** 進行輕量級的全域狀態管理，主要 Store 包括：

- `useUIStore.ts`: 管理 UI 狀態，如主題 (Theme)、側邊欄摺疊、Modal 開關、視窗關閉模式等。
- `useStreamStore.ts`: 管理串流視窗 (Streams) 的增刪、排列與相關資料。
- `playerStore.ts`: 管理播放器相關狀態 (如全域音量控制)。

### 3. 路由設計 (Routing)

專案目前採用 **State-based Routing** (在 `App.tsx` 中管理 `currentPage` 狀態) 來切換主要視圖，而非傳統的 URL Routing (如 React Router)。
主要頁面狀態：

- `home`: 主要多視窗觀看介面。
- `landing`: 著陸頁 (Landing Page)。
- `tool`: 工具頁面 (Dashboard)。
- `about`: 關於頁面。
- `settings`: 設定頁面。
- `instructions`: 使用教學頁面。

### 4. 資料流與 API

- 使用 **TanStack Query** 處理非同步資料獲取、快取與同步 (如 Twitch API 整合)。
- API 互動邏輯封裝於 `src/api` 或個別 Feature 的 Service 中。

## 功能模組 (Features)

- **Favorites (收藏管理)**: 提供 Twitch 頻道收藏、分組管理、匯入/匯出功能，並整合設定介面。
- **Feedback (意見回饋)**: 提供使用者回報 Bug 或建議的介面，支援表單填寫與自訂欄位。
- **Analytics (數據分析)**: 追蹤使用者行為與系統事件 (整合 Google Analytics 或其他服務)。
- **Backup (備份還原)**: 提供使用者設定與收藏列表的備份與恢復功能 (Local Storage 或檔案匯出)。
