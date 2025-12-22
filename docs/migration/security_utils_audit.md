# Security & Utils 遷移盤點報告 (PR A)

## 1. 概覽

本報告盤點 `js/security.js` 與 `js/utils.js` 的功能、依賴與遷移風險。此階段僅定義契約 (Contracts) 與盤點，不進行實際程式碼遷移。

## 2. js/security.js 盤點

| 函式名稱 | 用途 | 輸入/輸出 | 依賴/副作用 | 狀態 | 使用者 (Caller) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `escapeHtml` | 防止 XSS，將字串轉為 HTML 實體 | `any` -> `string` | `document.createElement` (DOM) | **Active** | `js/settings.js` (大量使用) |
| `safeJSONParse` | 解析 JSON 並處理錯誤 | `string`, `default` -> `obj` | 無 (Pure JS) | **Active** | `js/settings.js`, `js/promotion.js`, React Components |
| `validateUrl` | 驗證並解析串流 URL | `string` -> `Object` | `URL` API | **Migrated** | `src/utils/streamUtils.ts` 已有新實作，舊版仍被依賴 |
| `validateChannelId` | 驗證頻道 ID 格式 | `string` -> `boolean` | Regex | **Migrated** | 同上 |
| `validateVideoId` | 驗證影片 ID 格式 | `string` -> `boolean` | Regex | **Migrated** | 同上 |

### 風險評估

- **escapeHtml**: 嚴重依賴 DOM (`document.createElement`)。在 SSR 環境（如果有的話）會失敗，但在 SPA 用戶端環境無虞。
- **validateUrl**: 新舊版邏輯需保持一致，建議直接將新版邏輯暴露給舊版使用。

## 3. js/utils.js 盤點

| 變數/函式 | 用途 | 類型 | 依賴 | 狀態 | 使用者 (Caller) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ytApiReady` | 標記 YouTube API 載入狀態 | Global State | 無 | **Dead Code** | 僅寫入 (`onYouTubeIframeAPIReady`)，未被讀取。由 `apiLoader.ts` 取代。 |
| `onYouTubeIframeAPIReady`| 設定上述標誌 | Callback | 無 | **Legacy** | `apiLoader.ts` 已接管此 callback。 |
| `isDraggingStreamBox` | 標記拖曳狀態，暫停布局更新 | Global State | 無 | **Active** | `layout.js` (read), `drag-resize.js` (write) |
| `getParentDomain` | 取得嵌入所需的 parent 域名 | Function | `window.location` | **Active** | `js/chat.js`, `js/stream.js` |
| `getTwitchParents` | 取得 Twitch 嵌入 parent 陣列 | Function | calls `getParentDomain` | **Active** | 同上 |

### 風險評估

- **isDraggingStreamBox**: 這是跨檔案共用的全域變數。
  - **挑戰**: `js/utils.js` 使用 top-level `let` 宣告。在非模組 script tag 中，這會創造一個全域變數（但在 window 物件上不一定可見，視瀏覽器與載入方式而定，但其他 script 可以存取）。
  - **對策**: 遷移後的 React 模組必須顯式將此狀態掛載到 `window.isDraggingStreamBox`，並確保 `layout.js` 能夠讀取。
- **getParentDomain**: 依賴 `window.location`，純瀏覽器邏輯，遷移無風險。

## 4. 遷移策略 (Contract)

### A. 型別定義

已建立 `src/utils/security/types.ts` 與 `src/utils/common/types.ts` 定義介面。

### B. 雙系統共存方案

在 PR B (Implementation) 階段：

1. 在 `src/utils` 下實作上述介面。
2. 建立 `src/bootstrap/initSecurity.ts` 與 `src/bootstrap/initUtils.ts`。
3. 在 `main.tsx` 或 `index.html` 的早期階段載入這些 init script。
4. init script 將新版函式掛載到 `window` 上，覆蓋或填充 legacy 函式。
5. **關鍵**: `js/security.js` 與 `js/utils.js` 可在 PR C (Cleanup) 階段移除，但在 PR B 階段需確保新版優先載入或相容。

## 5. 結論

本次盤點確認了所有受影響的函式與變數。`isDraggingStreamBox` 是唯一需要特別留意的狀態同步點。其餘皆為工具函式，可安全遷移。
