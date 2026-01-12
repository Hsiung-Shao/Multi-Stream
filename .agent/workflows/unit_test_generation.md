---
description: 自動為 React 元件生成對應的單元測試
---

此工作流程旨在掃描 `src` 目錄下的元件、工具函式、Hooks 與 Store，並為缺少的項目生成 Vitest 單元測試。

1. **環境檢查**
    - 確認 `package.json` 中已有 `test` 腳本 (`vitest`)。
    - 確認已安裝 `vitest` 和 `@testing-library/react` (如果尚未安裝，雖然專案似乎已有相關依賴，但需確認)。

2. **識別目標元件**
    - 取得 `src/components` 下的所有 `.tsx` 檔案列表。
    - **排除** `src/components/ui` 目錄（Shadcn UI 元件）。
    - **排除** 已經有對應 `.test.tsx` 或 `.spec.tsx` 的檔案。

3. **生成測試檔案**
    針對不同類型的檔案採取不同策略：

    **A. React 元件 (`src/components`)**
    - 讀取元件原始碼。
    - 建立同名的 `.test.tsx` 檔案。
    - 使用 `@testing-library/react`。
    - Mock 必要依賴 (API, hooks)。

    **B. 工具函式 (`src/utils`)**
    - 對於純函數，直接使用 `vitest` 的 `describe`, `it`, `expect`。
    - 驗證輸入輸出的正確性與邊界情況。
    - Mock 外部依賴 (如 `fetch`, `localStorage`)。

    **C. React Hooks (`src/hooks`)**
    - 使用 `@testing-library/react` 的 `renderHook`。
    - 測試 Hook 的回傳值變化與副作用。

    **D. Zustand Stores (`src/store`)**
    - 測試 Store 的 Action 是否正確更新 State。
    - 使用 `beforeEach` 重置 Store 狀態。

4. **驗證**
    - 執行 `npm run test` 確認測試通過。
