---
description: 分析我的代碼變動，寫一個 Commit Message。
---

1. **獲取變動 (Get Changes)**
    - 使用 `run_command` 執行 `git diff --cached` 以獲取暫存區的變動。
    - 如果暫存區為空，則執行 `git diff` 以獲取工作區的變動。
    - 確保獲取完整的 diff 內容以便分析。

2. **分析變動 (Analyze Changes)**
    - **識別類型 (Type)**:
        - `feat`: 新增功能
        - `fix`: 修復 Bug
        - `docs`: 文檔變更
        - `style`: 格式調整 (不影響代碼運行)
        - `refactor`: 重構 (既不是新增功能也不是修復 Bug)
        - `perf`: 效能優化
        - `test`: 測試相關
        - `chore`: 建置過程或輔助工具的變動
        - `revert`: 回滾提交
    - **識別範圍 (Scope)**: 變動影響的模組或組件名稱 (可選)。
    - **識別原因 (Reasoning)**: 對於邏輯修改，分析 "為什麼" 要這樣改 (例如：修復了什麼錯誤、優化了什麼流程)。

3. **生成 Commit Message**
    - **語言規範**: 必須使用 **繁體中文**。
    - **標題行 (Subject Line)**:
        - 格式: `type(scope): subject` (若無 scope 則為 `type: subject`)
        - 內容: 簡明扼要地描述變更內容。
    - **內容主體 (Body)**:
        - 如果變動包含重大邏輯修改、破壞性變更 (Breaking Changes) 或複雜的重構，**必須**包含 Body。
        - 詳細說明變更的原因 (Why) 和具體做法 (What)。
        - 引用檔案時，僅使用 `[檔案名稱]` 格式 (例如 `[Button.tsx]`)，**不要**包含完整路徑。
    - **範例**:

        ```text
        fix(auth): 修復登入時的 Token 驗證錯誤

        由於後端 API 更新了錯誤碼格式，導致原本的 Token 過期判斷失效。
        本次修改更新了錯誤處理邏輯，確保在收到 401 時能正確觸發登出流程。
        涉及檔案：
        - [AuthService.ts]
        - [LoginForm.tsx]
        ```

4. **輸出結果**
    - 將生成的 Commit Message 輸出給使用者。
    - 詢問使用者是否滿意或需要調整。
