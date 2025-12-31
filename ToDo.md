# TODO

## 筆記prompt

不做任何修改

如果有任何問題請先不要做任何修改，先反問再做處理
你的最終回覆必須使用繁體中文，這包含implementation_plan.md、Walkthrough、Task等都必須使用繁體中文

不做任何修改

你的最終回覆必須使用繁體中文，這包含implementation_plan.md、Walkthrough、Task等都必須使用繁體中文
代理server 啟動指令: wrangler pages dev functions --port 8788
Shadcn UI

## 需要優化的內容

- Navbar 的 RWD 需要優化
- 手機版面優化
- 任意解析度版面優化

## 待新增功能

### [] 1. Twitch 分類搜尋

### [] 2. Twitch 使用者追隨頻道匯入

### [*] 3. Feedback 系統

### [] 4. 快捷鍵功能

### [] 5. 短期觀看串流復原

### [] 6. streambox 模組升級為畫布功能

### [] 7. 網站的主題個人化調整

### [] 8. 將製作首頁將觀看區域做區分

### [] 9. 訂閱會員付費功能

### [] 10. 小人移動顯示聊天氣泡的趣味功能

### [] 11. 在畫布功能下提供全螢幕功能

### [] 12. 製作 PWA 功能

### [] 13. 新增未直播以及正在直播兩個標籤(僅收藏串流使用)

### [] 14. 聊天室布局更新，添加更多的聊天室布局 6、8、10

## Bug Fixes

- [ ] Fix StreamBox black screen (layout type mismatch)

## 重構建議

經過分析您的專案結構與 package.json，我整理出以下幾個可以透過導入套件或重構來達到「輕量化」與「提升開發體驗」的建議方向：

1. [*] 移除 @mui/material 並全面擁抱 Radix UI + Tailwind CSS (輕量化/效能)
    - 現狀：您的專案目前同時並存了兩個巨大的 UI 系統。package.json 中顯示您已經引入了大量 @radix-ui primitives 和 lucide-react (通常是 shadcn/ui 的一部分)，但在 FavoritesManager.tsx 等檔案中仍在使用 @mui/material 的 Button, Checkbox, Box。

    - 問題：MUI 是一個非常重型的 UI 庫，與 Tailwind CSS 的設計理念也不同。同時加載這兩套系統會顯著增加 Bundle Size (打包大小)，影響網頁載入速度。

    - 建議：
        - 移除 MUI：將剩餘的 MUI 組件 (Button, Input, Checkbox, Tabs) 全部替換為專案現有的 ui (shadcn-like) 組件。
        效益：這將是最顯著的輕量化優化，不僅減少最終代碼大小，也讓設計風格更加統一。

2. 引入 TanStack Query (React Query) (開發體驗/代碼簡化)
    - 現狀：目前資料獲取 (Twitch/YouTube API) 和狀態變更 (Favorites) 多依賴手刻的 Service 層 (如 twitchService, favoritesService) 以及組件內的 useEffect + useState 來處理 loading 狀態、錯誤處理和緩存。
    - 建議：引入 TanStack Query。
    - 用途：專門處理 Server State (API 資料)。它能自動處理 Loading/Error 狀態、自動重試、視窗聚焦時重新獲取數據 (Re-fetch on focus)、以及強大的緩存機制。
    效益：可以刪除大量手寫的 Loading/Error 處理邏輯，讓 Service 層更專注於「如何打 API」，而將「何時打 API」與「狀態管理」交給 React Query。這對於您計畫中的 Twitch 分類搜尋 和 追隨頻道匯入 功能非常有幫助。
3. 使用已安裝的 react-hook-form 優化表單 (代碼品質)

    - 現狀：在 FavoritesManager.tsx 中，我看到使用了大量的 useState 來管理表單欄位 (streamUrl, streamName, categoryName...)。
    - 發現：您的 package.json 其實已經安裝了 react-hook-form，但似乎尚未充分利用。
    - 建議：將 FavoritesManager 的表單邏輯改寫為 react-hook-form。
    - 效益：大幅減少 useState 的數量，內建驗證 (Validation) 機制更強大且易用，能有效提升該組件的可維護性。

4. 引入 Zustand 進行全域狀態管理 (架構優化)

    - 現狀：App.tsx 中承載了過多的全域狀態 (streams, isPanelCollapsed, theme 等) 和業務邏輯，這導致 App.tsx 變得龐大且難以維護 (Prop Drilling 問題)。
    - 建議：引入 Zustand。
    - 效益：它是一個非常輕量 (1kB) 且 Hook-based 的狀態管理庫。您可以將「串流列表管理」、「播放器狀態」等邏輯抽離出 App.tsx，放入獨立的 Store 中。這會讓 App.tsx 瘦身，且組件可以只訂閱它需要的狀態，減少不必要的渲染。

## 專案架構概覽與核心模組 (Project Architecture & Core Modules)

本專案採用 **Modern React + Legacy Bridge (Hybrid)** 架構。前端使用 React 18, Vite, TypeScript, Zustand, Tailwind CSS，並透過 Bridge 層與舊有的 Global Scripts 進行相容。

### 1. 系統分層架構 (Layered Architecture)

```mermaid
graph TD
    UI[UI Layer (Components)] --> Store[State Management (Zustand)]
    UI --> Features[Feature Modules]
    
    Features --> Services[Service Layer]
    Store --> Services
    
    Services --> Repos[Repository Layer]
    Services --> API[API Utilities]
    
    Repos --> Storage[Browser Storage (LocalStorage/IndexedDB)]
    API --> ExtAPI[External APIs (Twitch/YouTube)]
    
    %% Legacy Bridge
    UI -.-> Legacy[Legacy Global Bridge (window.*)]
    Store -.-> Legacy
```

### 2. 核心模組與職責 (Core Modules & Responsibilities)

#### A. 入口點 (Entry Points)

- **`src/main.tsx`**: 應用程式啟動入口。負責：
  - 初始化版本檢查 (`versionCheck`) 與清理。
  - 初始化標籤系統 (`tagsService`)。
  - 注入 `apiLoader`。
  - 設置 **Global Shim** (`window.addStream`) 以確保外部調用能導向 React 應用。
- **`src/App.tsx` (The God Component)**: 目前的主要控制器。負責：
  - **佈局管理**: 渲染 `Navbar`, `StreamContainer`, `ControlPanel`。
  - **全局邏輯**: 音量控制 (`MasterVolume`), 主題切換, 模態框管理。
  - **Legacy Sync**: 監聽並同步 `window.players`, `window.streamData` 等全局狀態。
  - **背景任務**: 自動刷新收藏狀態 (`AutoRefresh`).

#### B. 狀態管理 (State Management)

- **`src/store/useStreamStore.ts`**: 管理串流播放列表與佈局。
  - `streams`: 當前活躍的串流列表。
  - `layout`: 網格佈局模式。
  - **特殊職責**: 在更新 State 同時，會寫入 `window.streamData` 以維持與舊版聊天室功能的相容性。
- **`src/store/useUIStore.ts`**: 管理 UI 狀態（主題、側邊欄、Modals）。

#### C. 服務層 (Service Layer)

- **`src/features/favorites`**: 收藏夾與分類管理。
  - **`FavoritesService`**: 業務邏輯核心 (新增、移除、查重)。
  - **`FavoritesRepository`**: 資料持久化 (LocalStorage)。
  - **`CategoryRepository`**: 分類持久化。
- **`src/utils/apiLoader.ts`**: 統一的外部 API 載入器。
  - 管理 Twitch Player/Data API 和 YouTube Iframe/Data API 的載入順序與緩存。
  - 提供 `preload` 機制優化性能。

### 3. 關鍵功能呼叫流程 (Key Call Flows)

#### [流程 1] 新增串流 (Adding a Stream)

1. **User Action**: 用戶在 Navbar 輸入 URL 並按下 Enter。
2. **App Component**: `handleAddStream` 被觸發。
3. **Store Action**: 調用 `useStreamStore.getState().addStream(url)`。
4. **Validation**: `streamUtils` 解析 URL，`apiLoader` 載入 API 驗證頻道存在。
5. **State Update**: Store 更新 `streams` 陣列。
6. **Legacy Sync**: Store 同步寫入 `window.streamData[id]`。
7. **UI Render**: `StreamContainer` 偵測到 store 變化，渲染新的 `StreamBox`。

#### [流程 2] 收藏夾管理與刷新 (Favorites Management)

1. **Initialization**: `App.tsx` 啟動時觸發 `favoritesLoader`。
2. **Logic**: `FavoritesService` 從 `FavoritesRepository` 讀取數據。
3. **Refresh**: `App.tsx` 中的 `useEffect` (或背景 timer) 觸發 `refreshFavoritesStatus` 事件。
4. **API Call**: `FavoritesManager` (或其他監聽者) 使用 `window.twitchApi` / `window.youtubeApiUtils` 批量查詢開台狀態。
5. **Update**: 更新狀態並寫回 Repository，觸發 `backupService` 備份。

#### [流程 3] 音量控制 (Master Volume Control)

1. **User Action**: 用戶拖動 `ControlPanel` 的音量滑桿。
2. **Event**: 觸發 `App.handleMasterVolumeChange`。
3. **Global Update**: 更新 `useUIStore` 中的 `masterVolume`。
4. **Imperative Update (Legacy)**: `App.tsx` 遍歷 `window.players`，直接調用每個播放器實例的 `setVolume` 方法。
    - 這裡使用了 **命令式 (Imperative)** 操作而非 React 的聲明式 (Declarative) update，是主要的重構目標之一。

### 4. 遺留系統橋接 (Legacy System Bridge)
>
> 為了保持與舊版代碼 (特別是聊天室分離功能) 的相容性，本專案維護了以下全局變數：

- `window.streamData`: 映射 React State 中的串流資料，供 Legacy Scripts 讀取。
- `window.players`: 儲存真實的 Twitch/YouTube Player 實例。
- `window.createChat` / `window.toggleChat`: 直接操作 DOM 的聊天室管理函數。
- `window.addStream`: 讓外部腳本 (Bookmarklet 或 Console) 能調用 React 內部的 `addStream`。
