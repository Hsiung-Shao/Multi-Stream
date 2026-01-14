---
description: 分析目前現有代碼中那些功能是沒有被呼叫，但是被保留的檔案，告知我有哪些檔案、負責那些甚麼功能，刪除是否會對整體有影響
---

1. **檔案清單盤點 (Inventory)**
    - 列出 `src/` 目錄下的所有檔案。
    - 列出根目錄下的配置檔案 (如 `config.js`, `vite.config.ts`, `tailwind.config.js` 等)。

2. **建立排除清單 (Exclusion List)**
    - **入口點 (Entry Points)**: `src/main.tsx`, `src/App.tsx`, `index.html`。
    - **配置檔案 (Config Files)**: `vite.config.ts`, `postcss.config.js`, `tailwind.config.js`, `tsconfig.json`, `package.json`。
    - **開發環境資源**:
        - `config.js`: 此檔案被 `index.html` 引用，用於開發環境下的環境變數注入，**不可刪除**。
    - **型別定義**: `src/vite-env.d.ts` 或其他 `*.d.ts` 檔案。

3. **引用檢查 (Reference Check)**
    - 對於未在排除清單中的每個檔案：
        - 獲取檔案 Base Name (例如 `StreamBox.tsx`) 和完整引用路徑。
        - 使用 `grep_search` 在專案中搜尋該檔案名稱（過濾掉自身的定義）。
        - 檢查是否被 `import`、`require` 或動態 `import()` 引用。
        - 檢查是否在路由配置 (Router) 中被使用。

4. **功能分析 (Functional Analysis)**
    - 對於被標記為「無引用 (Unused)」的檔案：
        - 讀取檔案內容頭部 (前 50 行) 以了解其用途。
        - 判斷是否為：
            - 舊版 (Legacy) 功能備份。
            - 尚未實作完成的功能 (Work in Progress)。
            - 測試輔助工具 (Test Utils)。
            - 確實被遺棄的死代碼 (Dead Code)。

5. **生成分析報告 (Generate Report)**
    - 報告必須包含以下欄位：
        - **檔案路徑 (File Path)**
        - **推測功能 (Functionality)**: 簡述該檔案原本的作用。
        - **引用狀態 (Usage Status)**: 完全無引用 / 僅被註解引用 / 疑似動態引用。
        - **刪除風險 (Delete Risk)**:
            - **High**: 可能影響建置或執行 (例如全域副作用檔案)。
            - **Medium**: 可能是未來功能預留。
            - **Low**: 確定為冗餘代碼，可安全刪除。
        - **建議 (Recommendation)**: 保留 / 刪除 / 封存。
    - **注意**：所有報告內容必須使用**繁體中文**。
