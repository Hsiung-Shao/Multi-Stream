# 專案開發規則 (Project Rules)

本文件定義 Agent 協助開發時必須嚴格遵守的規範。

## 1. 語言規範 (Language)

- **繁體中文回覆**：所有最終產出（包含思考過程、對話回覆、implementation_plan.md、Walkthrough、Task 等 Artifacts）都**必須使用繁體中文**。

## 2. 開發流程與溝通 (Workflow & Communication)

- **先問後動 (Ask before Action)**：遇到任何不明確的需求或潛在風險時，**必須先向使用者確認，不要直接進行修改**。
- **UI/UX 設計**：在實作功能時，必須同時考量 UI 的美觀與 UX 的易用性，不僅僅是完成功能邏輯。

## 3. 架構與設計原則 (Architecture & Design)

- **模組化與輕量化**：優先採用模組化 (Modular) 或輕量化 (Lightweight) 的設計方式。避免過度設計，保持程式碼簡潔。
- **三大核心考量**：
    1. **效能 (Performance)**：避免不必要的渲染與資源浪費。
    2. **安全性 (Security)**：注意資料驗證與潛在的安全漏洞。
    3. **可維護性 (Maintainability)**：寫作清晰、易讀且易於擴充的程式碼。

## 4. 技術堆疊規範 (Tech Stack)

- **UI 元件庫**：強制使用 **Shadcn UI** 元件。
- **多國語系 (i18n)**：功能開發必須支援多國語系。
  - 參考路徑：`/src/i18n/locales`
  - 確保新增的 UI 文字都有對應的翻譯鍵值 (Keys)。

## 5. 文件規範 (Documentation)

- 保持 `rules.md`、`task.md`、`implementation_plan.md` 等文件的更新，確保開發狀態與規則同步。
