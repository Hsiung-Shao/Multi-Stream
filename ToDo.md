# TODO

## 目前存在的問題

## 嚴格遵守專案規則

- 你的最終回覆必須使用繁體中文，這包含思考過程、對話、implementation_plan.md、Walkthrough、Task等都必須使用繁體中文
- 如果有任何問題請先不要做任何修改，先反問再做處理
- 如果功能本身可以模組化或是輕量化設計，優先朝這個方向思考
- 多國語系:參考 /src/i18n/locales
- UI元件要求使用 Shadcn UI
- 在設計功能事都要以效能、安全性、可維護性三個角度來思考
- 需求UIUX設計

## 文件規則

- [] 為還沒完成
- [*] 為已經完成
- [-] 為正在進行中
- [@] 為不達預期

## 目前更新內容

- 畫布功能(Canvas)

### 達成目標

## 開發功能目標

## 筆記prompt

不做任何修改，請先理解規則，並且遵守
嚴格遵守專案規則:

- 你的最終回覆必須使用繁體中文，這包含思考過程、對話、implementation_plan.md、Walkthrough、Task等都必須使用繁體中文
- 如果有任何問題請先不要做任何修改，先反問再做處理
- 如果功能本身可以模組化或是輕量化設計，優先朝這個方向思考
- 多國語系:參考 /src/i18n/locales
- UI元件要求使用 Shadcn UI
- 在設計功能事都要以效能、安全性、可維護性三個角度來思考
- 需求UIUX設計

請分析我的代碼變動，寫一個 Commit Message。要求：1. 使用 Conventional Commits 格式（如 feat:, fix:）。2. 第一行簡述變動。3. 如果有重大邏輯修改，在 Body 部分詳細說明為什麼這樣改。4.語言請用繁體中文。
5.不用給檔案路徑，僅需提供檔案[檔案名稱]。

代理server 啟動指令: wrangler pages dev functions --port 8788
Shadcn UI

## 需要優化的內容

- Navbar 的 RWD 需要優化
- 手機版面優化
- 任意解析度版面優化

## 待新增功能

### [] 1. Twitch 分類搜尋

### [*] 2. Twitch 使用者追隨頻道匯入

### [*] 3. Feedback 系統

### [] 4. 快捷鍵功能

### [] 5. 短期觀看串流復原

### [*] 6. streambox 模組升級為畫布功能

### [] 7. 網站的主題個人化調整

### [*] 8. 將製作首頁將觀看區域做區分

### [] 9. 訂閱會員付費功能

### [] 10. 小人移動顯示聊天氣泡的趣味功能

### [*] 11. 在畫布功能下提供全螢幕功能

### [] 12. 製作 PWA 功能

### [*] 13. 新增未直播以及正在直播兩個標籤(僅收藏串流使用)

### [*] 14. 聊天室布局更新，添加更多的聊天室布局 6、8、10

### [*] 15. 使用React GA4 套件來建置，以更精準的追蹤事件

### [] 16. 新增本地語言推送更新功能

### [] 17. 新增SOOP觀看平台

### [*] 18. 收藏管理多重編輯

## 專案 UI 檔案結構說明

以下整理目前專案中負責 UI 顯示的主要檔案及其功能分類：

### 1. 頁面與路由 (Pages)

負責整個頁面的主要顯示邏輯，通常是路由 (Router) 的目標。

- **`src/components/Pages/LandingPage.tsx`** (形象首頁)
  - **功能**: 應用程式的入口歡迎頁面。
  - **內容**: 包含 Hero 區塊、功能介紹、Footer 等，引導使用者進入工具。
- **`src/components/Pages/HomePage.tsx`** (主頁面 / 工具入口)
  - **功能**: 應用程式的主介面框架。
  - **內容**: 目前主要包含頂部導覽列 (`Navbar`)，作為進入各功能的入口。
- **`src/components/Pages/NewCanvasPage.tsx`** (畫布頁面)
  - **功能**: **核心功能區**，顯示所有直播視窗與聊天室的地方。
  - **內容**: 包含網格系統 (`SimpleCanvas`)，負責渲染與管理所有視窗。
- **`src/components/Pages/InstructionsPage.tsx`** (教學頁面)
  - **功能**: 顯示使用說明與教學文件。

### 2. 導覽與全域控制 (Navigation)

負責應用程式的導航與全局功能控制。

- **`src/components/Navbar.tsx`** (頂部導覽列)
  - **功能**: 位於頁面頂部，提供主題切換、關於我們、教學等按鈕。
- **`src/components/Navigation/DynamicIsland.tsx`** (動態島 / 底部控制列)
  - **功能**: **核心控制中樞**，位於畫面底部中央的浮動工具列。
  - **內容**: 包含搜尋、新增視窗、佈局切換、媒體控制、收藏清單、全螢幕切換等功能入口。
- **`src/components/Navigation/MediaControlPanel.tsx`** (媒體控制面板)
  - **功能**: 從動態島展開的面板。
  - **內容**: 控制全域音量、個別串流音量與靜音、串流排序功能。
- **`src/components/Navigation/IslandLayoutPicker.tsx`** (佈局選擇器)
  - **功能**: 從動態島展開，用於快速切換不同的視窗佈局。

### 3. 畫布與視窗系統 (Canvas & Windows)

負責處理直播視窗的顯示、拖拉與縮放。

- **`src/components/Canvas/SimpleCanvas.tsx`**
  - **功能**: 畫布的主容器，負責計算網格與視窗位置。
- **`src/components/Canvas/DraggableWindow.tsx`**
  - **功能**: 單一視窗的包裝器，處理「拖曳」與「縮放」的互動邏輯。
- **`src/components/Canvas/WindowParts/WindowHeader.tsx`**
  - **功能**: 視窗的頂部標題列 (包含拖曳手把、關閉按鈕、重新整理按鈕)。
- **`src/components/Canvas/WindowParts/WindowContent.tsx`**
  - **功能**: 視窗的主要內容區域。
- **`src/components/Canvas/WindowParts/StreamIframe.tsx`**
  - **功能**: 實際嵌入 Twitch/YouTube 用於播放影片的 Iframe 元件。

### 4. 收藏與管理 (Favorites Feature)

位於 `src/features/favorites/components/`，負責所有收藏相關的 UI。

- **`FavoritesManagerMain.tsx`**
  - **功能**: **收藏管理主視窗**。整合了收藏列表、Twitch 匯入、分類管理、標籤管理等所有分頁。
- **`FavoritesSidebar.tsx`**: 管理視窗左側的選單 (切換分類/標籤)。
- **`FavoritesToolbar.tsx`**: 管理視窗上方的工具列 (搜尋、全選、新增按鈕)。
- **`TwitchIntegrationSection.tsx`**: 負責顯示 Twitch 登入與匯入追隨频道的介面。
- **`BatchImportSection.tsx`**: 批次匯入文字介面。

### 5. 對話框 (Dialogs)

位於 `src/components/Dialogs/`，處理特定功能的彈出視窗。

- **`AddStreamDialog.tsx`**: 新增直播的輸入視窗。
- **`SettingsDialog.tsx`**: 一般設定視窗 (目前部分功能已整合至收藏管理)。
- **`AddWindowDialog.tsx`**: 新增視窗的通用對話框。

### 6. 通用元件 (UI Library)

- **`src/components/ui/`**: 包含所有 Shadcn UI 基礎元件 (如 `Button.tsx`, `Dialog.tsx`, `Slider.tsx`, `ScrollArea.tsx` 等)，這些是構成上述所有介面的積木。
