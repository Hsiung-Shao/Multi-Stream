# Project Status: Major Refactor (Shadcn UI + 24x24 Grid)

- [ ] **Phase 1: 基礎建設與頁面重構 (Infrastructure & Routing)** <!-- id: 100 -->
  - [x] 安裝與配置 Shadcn UI 必要組件 (Dialog, Sheet, Dropdown, Slider, etc.) <!-- id: 101 -->
  - [ ] 路由重構 (Routing Refactor) <!-- id: 102 -->
    - [ ] 建立 `Home` 頁面 (保留 Navbar) <!-- id: 103 -->
    - [ ] 建立 `CanvasPage` (無 Navbar, 僅 Dynamic Island) <!-- id: 104 -->
    - [ ] 建立 `FixedPage` (無 Navbar, 僅 Dynamic Island) <!-- id: 105 -->
  - [ ] 實作 `DynamicIsland` 組件 <!-- id: 106 -->
    - [ ] 可拖曳 (Draggable) 與自動貼邊 <!-- id: 107 -->
    - [ ] 整合控制選單 (Shadcn Dialog 觸發) <!-- id: 108 -->

- [ ] **Phase 2: 24x24 無限畫布 (Infinite Canvas 2.0)** <!-- id: 200 -->
  - [ ] 實作 24x24 邏輯網格系統 (Logical Grid System) <!-- id: 201 -->
  - [ ] 實作視覺化網格背景 (CSS Grid Background) <!-- id: 202 -->
  - [ ] 重構 `CanvasItemWrapper` (Shadcn 風格, 移除舊樣式) <!-- id: 203 -->
  - [ ] 實作佈局對齊邏輯 (Snap to 24x24) <!-- id: 204 -->
  - [ ] 實作「收藏加入」智能邏輯 (20x24 Stream + 4x24 Chat) <!-- id: 205 -->

- [ ] **Phase 3: 功能整合與對話框 (Feature Integration)** <!-- id: 300 -->
  - [ ] 實作「新增視窗」對話框 (Shadcn Dialog) <!-- id: 301 -->
  - [ ] 實作「設定 & 收藏」對話框 (Shadcn Dialog) <!-- id: 302 -->
  - [ ] 遷移媒體控制至動態島/Dialog <!-- id: 303 -->
  - [ ] 實作畫布全螢幕功能 <!-- id: 304 -->
  - [ ] 實作 頻道/聊天室 切換顯示功能 <!-- id: 305 -->

- [ ] **Phase 4: 固定頁面遷移 (Fixed Layout Migration)** <!-- id: 400 -->
  - [ ] 將現有預設佈局 (Grid 2x2, Focus, etc.) 遷移至 `FixedPage` <!-- id: 401 -->
  - [ ] 確保 Fixed 頁面與動態島互動正常 <!-- id: 402 -->

- [ ] **Phase 5: 清理與優化 (Cleanup)** <!-- id: 500 -->
  - [ ] 移除舊版 `ControlPanel` 代碼 <!-- id: 501 -->
  - [ ] 移除舊版 Navbar (在非首頁) 邏輯 <!-- id: 502 -->
  - [ ] 全站樣式統一 (Holodex Dark Theme) <!-- id: 503 -->
