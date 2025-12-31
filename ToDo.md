# TODO

## 專案架構概覽與核心模組 (Project Architecture & Core Modules)

本專案採用 **Modern React + Legacy Bridge (Hybrid)** 架構。前端使用 React 18, Vite, TypeScript, Zustand, Tailwind CSS, Shadcn UI，並透過 Bridge 層與舊有的 Global Scripts 進行相容。

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

# 代碼審查報告 (Code Review Report)

## 1. 執行摘要 (Executive Summary)

目前的專案處於 **混合架構 (Hybrid Architecture)** 階段。雖然已經成功引入了現代化的技術棧 (React 18, Vite, TypeScript, Zustand, Tailwind CSS)，但代碼庫中仍保留了大量的「遺留代碼橋接 (Legacy Bridges)」和「全局變數依賴」。

- **優點**:
  - 專案結構清晰 (Features/Components/Store/Services 分層)。
  - 使用了強型別 (TypeScript Strict Mode)。
  - UI 組件化程度高 (基於 Shadcn UI)。
  - 核心功能如收藏管理 (`FavoritesService`) 已採用較好的服務模式。

- **主要風險**:
  - `App.tsx` 過於龐大 (God Component)，包含過多業務邏輯。
  - 狀態管理存在「雙重真相 (Double Truth)」問題 (Zustand Store 與 `window.streamData` 同步)。
  - 對 `window` 全局對象的依賴過重，增加了維護難度和潛在的運行時錯誤風險。

## 2. 詳細發現 (Detailed Findings)

### 2.1 架構與代碼組織 (Architecture & Organization)

- **App.tsx (God Component)**:
  - 檔案超過 1000 行。
  - **問題**: 混合了 UI 佈局、音量控制邏輯、API 載入、事件監聽、Legacy 兼容代碼等。
  - **影響**: 難以測試，難以閱讀，任何修改都可能導致意外的副作用。
  - **建議**: 應將邏輯拆分為 Custom Hooks (如 `useMasterAudio`, `useAutoRefresh`, `useLegacyBridge`)。

- **遺留代碼集成 (Legacy Integration)**:
  - 專案中大量使用了 `window.streamData`, `window.players`, `window.streamCount`。
  - `src/main.tsx` 和 `App.tsx` 中存在 Monkey-patching (如 `window.addStream = ...`)。
  - **影響**: 破壞了 React 的單向資料流原則，使狀態難以追蹤。

### 2.2 狀態管理 (State Management)

- **useStreamStore.ts**:
  - 雖然使用了 Zustand，但在 Action (如 `addStream`, `updateStream`) 中手動同步 `window.streamData`。
  - **ID 生成**: 依賴 `window.streamCount` (Line 119) 來生成 ID。這是一個危險的模式，應該在 Store 內部維護計數器或使用 UUID。
  - **API 調用**: Store 內部直接調用 `window.twitchApi`，導致 Store 與 View 層/Global 層耦合。

### 2.3 性能與最佳實踐 (Performance & Best Practices)

- **音量控制 (`handleMasterVolumeChange`)**:
  - 透過遍歷 `window.players` 進行 DOM 操作或 API 調用。雖然效率很高，但這種命令式編程 (Imperative Programming) 與 React 的聲明式 (Declarative) 風格不符。
  - **建議**: 長期來看應封裝 `Player` 實例的管理，或確保這種副作用被隔離。

- **apiLoader.ts**:
  - 使用 `setInterval` 輪詢檢查外部腳本載入狀態。這是必要的惡，但其中的 Legacy Shim (自動填充 `window.twitchApi`) 顯示專案仍在過渡期。
  - **建議**: 持續將這些全局依賴遷移至 Service 層導入。

### 2.4 安全性與穩定性 (Security & Stability)

- **API Key**: 雖然前端專案難以完全隱藏 API Key，但應確保敏感邏輯盡量在後端或 Serverless Functions (如 `functions` 目錄所示) 中執行。
- **類型安全**: `App.tsx` 中的 `declare global` 是一種權宜之計。建議將其移動到專案的 `types/global.d.ts` 或 `src/types` 目錄下統一管理，避免污染組件代碼。

## 3. 重構建議路線圖 (Refactoring Roadmap)

### 階段一：邏輯抽離 (Logic Extraction)
>
> **目標**: 為 `App.tsx` 減肥，提高可讀性。

1. **Extract Hooks**:
    - `useAudioController`: 封裝所有音量/靜音相關邏輯。
    - `useAutoRefresh`: 封裝背景刷新邏輯。
    - `useYouTubeRiskMonitor`: 封裝 YouTube 風險提示邏輯。
    - `useLegacyBridge`: 將所有 `window.xxx = ...` 的賦值操作移至單獨的組件或 Hook 中。

2. **Service Integration**:
    - 確保 `useStreamStore`不再直接依賴 `window` 對象，而是調用 `apiLoader` 或相關 Service。

### 階段二：狀態統一 (State Unification)
>
> **目標**: 消除 `window` 全局變數依賴。

1. **ID Generation**: 改用 React/Store 內部的 ID 生成機制 (如 `crypto.randomUUID()` 或 Store 內計數)。
2. **Remove Legacy Sync**: 逐步移除 `useStreamStore` 中對 `window.streamData` 的寫入，並修改讀取端改為訂閱 Store。

### 階段三：全面現代化 (Full Modernization)
>
> **目標**: 純淨的 React 架構。

1. **Replace window.players**: 建立一個 React Context 或 Store 來管理播放器實例引用，而非掛載在 window 上。
2. **Clean up types**: 移除 `declare global` 中不再需要的遺留屬性。

## 4. 結論 (Conclusion)

專案代碼質量總體良好，特別是在新的 Feature 模組 (Favorites) 中。主要的技術債來自於為了維持與舊版功能的兼容性而保留的 Global Variable 依賴。建議接下來的開發重點放在「逐步剝離 Global 依賴」與「拆分 App.tsx」上。
