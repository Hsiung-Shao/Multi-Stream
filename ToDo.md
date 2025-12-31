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
