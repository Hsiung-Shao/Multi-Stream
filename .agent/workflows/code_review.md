---
description: 執行全面的代碼審查，分析安全性、效能與可維護性。
---

1. **確認審查範圍**
    - 預設審查目錄為 `src/`。
    - 如果使用者有指定特定檔案或模組，則針對該範圍進行審查。

2. **安全性分析 (Security Analysis)**
    - 使用 `grep_search` 或相關工具檢查以下項目：
        - 是否存在 Hardcoded Secrets (API Keys, Passwords)。
        - 是否存在 `dangerouslySetInnerHTML` 或其他潛在的 XSS 風險點。
        - 檢查是否有不安全的 HTTP 請求 (使用 `http://` 而非 `https://`)。

3. **效能分析 (Performance Analysis)**
    - 檢查 React Components：
        - 是否有不必要的重新渲染風險 (缺少 `useMemo`, `useCallback` 的明顯案例)。
        - 檢查大列表渲染是否未使用虛擬化 (Virtualization) 技術。
    - 檢查資源載入：
        - 圖片是否缺少 `loading="lazy"` 或優化屬性。
        - 是否有過大的 import 或未使用的依賴引用。

4. **可維護性分析 (Maintainability Analysis)**
    - 檢查代碼重複性 (DRY Principle)。
    - 檢查變數與函數命名是否清晰且具描述性。
    - 檢查 TypeScript 型別定義是否完善 (避免過多 `any`)。
    - 檢查是否包含適當的註解 (Documenting Intent, not just behavior)。

5. **生成審查報告**
    - 彙整以上分析結果。
    - 為每個發現的問題提供：
        - **嚴重程度** (高/中/低)。
        - **問題描述**。
        - **具體改善建議** (包含代碼範例)。
    - **最終總結**：對整體代碼品質進行評分或給予總結性建議。
    - **注意**：所有報告內容必須使用**繁體中文**。
