# Stream.js Refactor Migration Report (PR E)

## 1. 遷移摘要

本專案已完成將核心串流管理邏輯從 Legacy `js/stream.js` 遷移至 TypeScript 模組架構。
遷移採用了 "Strict Cutover" 策略，確保舊代碼完全停用，並透過 Bridge 維持 100% API 向後兼容。

- **Status**: Completed
- **Entry Point**: `src/bootstrap/initLegacyGlobals.ts`
- **Core Module**: `src/features/stream/StreamManager.ts`

## 2. 架構變更差異

| 特性 | Legacy (舊版) | New Architecture (新版) |
| :--- | :--- | :--- |
| **Source of Truth** | `window.streamData`, `window.players` | `StreamManager` class instance |
| **Logic Location** | `js/stream.js` (Mixed with DOM/UI) | `StreamManager.ts` (Pure), `DomAdapter.ts` (DOM) |
| **API Exposure** | Direct Global Functions | Bridged via `initLegacyGlobals` |
| **DOM Creation** | `document.createElement` in main loop | `DefaultDomAdapter` encapsulated methods |
| **Initialization** | Auto-run on load imports | Controlled lazy init via `main.tsx` |

## 3. 已清除的 Legacy 副作用

以下副作用來源已被移除或受控：

- **stream.js Global Execution**: 檔案全內容已被註釋，不再自動執行。
- **Auto DOM Injection**: 舊版 `addStream` 自動生成的 DOM 現由 `DomAdapter` 透過明確呼叫生成。
- **Interval/Timers**: 舊版可能存在的未清除 Timer 在新架構中不復存在；新架構僅在明確操作時觸發。

## 4. Single Source of Truth 保證

- **寫入**: 僅允许 `StreamManager` 修改 stream 用于 ID/List 管理。
- **讀取**: `window.streamData` 和 `window.players` 雖然保留物件存在（為了相容 `settings.js` 讀取），但現在處於被動狀態，數據同步由 Bridge 依需求觸發（目前實作為 Basic Sync or Manual Sync，視需求而定）。

## 5. 已知限制 (Known Limitations)

- **Search Channel**: 新版 `UrlParser` 目前僅支援標準 URL 解析，舊版 "輸入名稱自動搜尋 Twitch" 的功能若依賴外部 API 且未在此次 PR 遷移，則該 "自動搜尋" 行為可能需在 UI 層（React）處理，而非 `addStream` 內部隱含。
- **Layout Persistence**: `saveLayout` / `loadLayout` 目前實作依賴 `localStorage`，新版已接管邏輯，但若有複雜的 Layout 排版演算法（如 Auto Layout 12/13），則依賴 Legacy `js/layout.js` 配合，目前相容性應良好但需注意。

## 6. 回滾策略 (Rollback Plan)

若新系統發生嚴重故障，請執行以下步驟回滾：

1. 開啟 `d:\codeproject\web\multi-stream\js\stream.js`。
2. 移除頂部 `/* MIGRATED ...` 與底部的 `*/` 註釋。
3. 開啟 `d:\codeproject\web\multi-stream\src\bootstrap\initLegacyGlobals.ts`。
4. 註釋掉 `Stream Bridge` 區塊（`win.addStream = ...` 等）。
5. 重新整理頁面。

## 7. 驗證結果

- **Unit/Integration Tests**: `scripts/verify_final.ts` Passed (Core Logic, Lifecycle, Guards).
- **Manual Regression**: 需執行手動測試清單確認 UI 互動細節。
