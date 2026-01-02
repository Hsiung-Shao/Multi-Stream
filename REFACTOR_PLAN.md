# 重構實作計畫 (Major Refactor Implementation Plan)

## 目標描述

將 `Multi-Stream` 重構為三個主要頁面：首頁、無限畫布、固定佈局。全面導入 **Shadcn UI**，並實作 **24x24 網格** 與 **動態島 (Dynamic Island)** 作為主要互動核心。

## 用戶審查要求
>
> [!IMPORTANT]
> 此計畫將大規模重構路由與現有 UI 組件。確認執行後，現有的 `ControlPanel` 側邊欄將被移除，並由動態島與 Dialog 取代。

## 變更規劃

### 1. 基礎建設 (Shadcn UI & 路由)

#### [NEW] `src/components/ui/*.tsx`

- 安裝必要的 Shadcn 組件：`dialog`, `sheet`, `dropdown-menu`, `slider`, `switch`, `button`, `input`。

#### [MODIFY] `src/App.tsx`

- 路由重構：
  - `/`：首頁 (Landing Page)，保留現有功能與導航列 (Navbar)。
  - `/canvas`：全新的無限畫布頁面，無導航列。
  - `/fixed`：固定的多視窗佈局頁面，無導航列。
- 導航列顯示邏輯：僅在 `/` 路徑下渲染 `Navbar`。

#### [NEW] `src/components/Navigation/DynamicIsland.tsx`

- **功能**：可拖曳懸浮、自動吸附邊緣。
- **內容**：
  - **首頁**：返回 `/`。
  - **新增**：開啟「新增視窗」對話框 (`AddWindowDialog`)。
  - **佈局**：開啟「佈局設定」對話框 (`LayoutSettingsDialog`) (儲存/讀取/清空)。
  - **媒體**：開啟「媒體控制」對話框 (`MediaControlsDialog`)。
  - **收藏**：開啟「收藏清單」對話框 (`FavoritesDialog`) (從 `ControlPanel` 遷移)。
  - **設定**：開啟「全域設定」對話框 (`SettingsDialog`) (網格開關等)。

### 2. 畫布引擎 (24x24 網格)

#### [MODIFY] `src/components/Canvas/CanvasContainer.tsx`

- **網格邏輯**：
  - 將視埠 (Viewport) 分割為 **24 欄 x 24 列**。
  - `snapToGrid` 邏輯更新：使用 `window.innerWidth / 24` 與 `window.innerHeight / 24` 作為單位。
- **樣式**：
  - 新增 CSS `background-image` 以顯示可視化的 24x24 網格線。
  - 新增「全螢幕」切換功能。

#### [MODIFY] `src/store/useStreamStore.ts`

- **網格設定**：硬編碼或配置網格為 24x24。
- **新增串流邏輯**：
  - 當從收藏清單加入時 (透過 Dialog)：
    - 建立串流視窗：寬 20 單位，高 24 單位。
    - 建立聊天室視窗：寬 4 單位，高 24 單位。
    - 邏輯：尋找可用的 24 單位寬度空位，或往右側追加。

#### [MODIFY] `src/components/Canvas/CanvasItemWrapper.tsx`

- **樣式**：極簡化邊框與標題列 (參考 Holodex 風格)。
- **控制項**：新增 顯示/隱藏 聊天室切換功能。

### 3. UI 組件 (對話框)

#### [NEW] `src/components/Dialogs/AddWindowDialog.tsx`

- 輸入網址 / 搜尋 / 選擇「串流」或「聊天室」類型。
- 「新增空白視窗」選項。

#### [NEW] `src/components/Dialogs/FavoritesDialog.tsx`

- 遷移自 `ControlPanel.tsx` 的邏輯 (收藏列表、標籤過濾)。
- 點擊動作：加入至畫布 (觸發 20x24+4x24 邏輯)。

#### [NEW] `src/components/Dialogs/MediaControlsDialog.tsx`

- 總音量控制、個別串流音量控制。

### 4. 驗證計畫

- **路由測試**：驗證 `/`, `/canvas`, `/fixed` 之間的導航是否正常。
- **網格測試**：調整瀏覽器視窗大小，確認網格始終保持視覺與邏輯上的 24x24。
- **新增測試**：加入收藏項目 -> 驗證是否呈現 20/4 分割並佔滿高度。
- **動態島測試**：拖曳動態島、點擊按鈕、驗證各個 Dialog 是否正常開啟。
