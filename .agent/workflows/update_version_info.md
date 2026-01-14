---
description: 更新網站版本資訊 (package.json, versionHistoryData, i18n)
---

1. **確認新版本資訊**
   - 詢問使用者新的版本號 (例如 `v2.4.0`)。
   - 詢問該版本的發布日期 (預設為今日，格式 `YYYY-MM-DD`)。
   - 詢問更新內容清單 (Change Log)。

2. **更新 package.json**
   - 讀取 `package.json`。
   - 修改 `version` 欄位為新版本號 (注意：去除 `v` 前綴，例如 `2.4.0`)。

3. **更新 src/config/versionHistoryData.ts**
   - 讀取 `src/config/versionHistoryData.ts`。
   - 在 `versionHistoryData` 陣列的**最前方**插入新的版本物件。
   - 格式範例：

     ```typescript
     {
         version: 'v2.4.0',
         dateKey: 'versionHistory:v2.4.0.date',
         changeKeys: [
             'versionHistory:v2.4.0.change1',
             'versionHistory:v2.4.0.change2',
             // 根據更新項目數量動態產生 key
         ],
     },
     ```

4. **更新 src/i18n/locales/zh-TW/versionHistory.ts**
   - 讀取 `src/i18n/locales/zh-TW/versionHistory.ts`。
   - 在 `versionHistory` 物件中新增對應的翻譯鍵值。
   - 格式範例：

     ```typescript
     'v2.4.0.date': '2026-01-12',
     'v2.4.0.change1': '新增功能 A',
     'v2.4.0.change2': '修復 Bug B',
     ```

   - **注意**：請確保鍵值名稱與 `versionHistoryData.ts` 中的 `changeKeys` 對應。

5. **生成 Commit Message (選用)**
   - 建議執行 `@[/generate_commit_message]` 來為這次的版本更新建立 Commit。
