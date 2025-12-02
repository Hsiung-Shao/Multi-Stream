# CI/CD 說明文檔

## 概述

本專案已設置完整的 CI/CD（持續整合/持續部署）流程，使用 GitHub Actions 自動執行測試，確保代碼品質。

## 重要說明

⚠️ **本 CI/CD 設置不會自動部署到 main 分支**。所有測試僅用於驗證代碼品質，您需要在確認測試通過後，手動推送到 main 分支。

## CI/CD 運作方式

### 1. 觸發條件

CI 流程會在以下情況自動觸發：

- **推送到任何分支**：當您推送代碼到任何分支時
- **創建 Pull Request**：當有人創建 PR 時
- **手動觸發**：在 GitHub Actions 頁面可以手動觸發

### 2. 測試流程

每次觸發時，會執行以下測試步驟：

#### 2.1 HTML 驗證
- **工具**: `html-validate`
- **檢查內容**: 
  - HTML 語法正確性
  - 標籤閉合
  - 屬性有效性
- **檢查文件**: `index.html`, `privacy.html`, `about.html`

#### 2.2 JavaScript 語法檢查
- **工具**: `ESLint`
- **檢查內容**:
  - JavaScript 語法錯誤
  - 代碼風格一致性
  - 潛在的程式錯誤
- **檢查文件**: 所有 `js/*.js` 文件

#### 2.3 連結檢查
- **工具**: `linkinator`
- **檢查內容**:
  - 內部連結有效性
  - 外部連結可訪問性
- **檢查文件**: 所有 HTML 文件中的連結

#### 2.4 無障礙性檢查
- **工具**: `pa11y`
- **檢查內容**:
  - WCAG 2.0 AA 標準合規性
  - HTML 語義化
  - ARIA 屬性使用
  - 鍵盤導航支援

### 3. 測試結果

#### 查看測試結果

1. **在 GitHub 上查看**:
   - 前往您的倉庫
   - 點擊 "Actions" 標籤
   - 選擇最新的 workflow 運行
   - 查看每個測試步驟的詳細結果

2. **在 Pull Request 中查看**:
   - 當創建 PR 時，測試結果會自動顯示在 PR 頁面
   - 綠色勾號 ✅ 表示測試通過
   - 紅色叉號 ❌ 表示測試失敗

#### 測試失敗處理

- **測試失敗不會阻止代碼推送**
- 所有測試步驟都設置了 `continue-on-error: true`，即使某個測試失敗，其他測試仍會繼續執行
- 建議在推送到 main 分支前修復所有測試問題

### 4. 本地測試

您也可以在本地運行測試：

```bash
# 安裝依賴
npm install

# 運行所有測試
npm test

# 運行單個測試
npm run test:html    # HTML 驗證
npm run test:js      # JavaScript 檢查
npm run test:links   # 連結檢查
npm run test:a11y    # 無障礙性檢查（需要先啟動本地伺服器）
```

**注意**: 無障礙性檢查需要本地伺服器運行。可以使用以下命令啟動：

```bash
# 使用 Python
python -m http.server 8000

# 或使用 Node.js
npx http-server
```

然後在另一個終端運行 `npm run test:a11y`。

## 部署流程

### 當前設置

- ✅ **CI（持續整合）**: 已啟用，自動執行測試
- ❌ **CD（持續部署）**: **未啟用自動部署**

### 手動部署流程

1. **確認測試通過**:
   - 查看 GitHub Actions 中的測試結果
   - 確保所有測試都通過（或至少沒有嚴重錯誤）

2. **推送到 main 分支**:
   ```bash
   git checkout main
   git merge dev  # 或您的工作分支
   git push origin main
   ```

3. **部署到 Cloudflare Pages**:
   - 如果已連接 Cloudflare Pages，推送後會自動觸發部署
   - 或手動在 Cloudflare Pages 控制台觸發部署

### 未來擴展

如果需要添加自動部署功能（僅限非 main 分支），可以：

1. 在 workflow 中添加部署步驟
2. 設置環境變數和密鑰
3. 配置部署目標（如 Cloudflare Pages API）

**但根據您的要求，main 分支不會自動部署，需要手動確認。**

## 配置文件說明

### `.github/workflows/ci.yml`
- GitHub Actions workflow 配置文件
- 定義了測試流程和觸發條件

### `.eslintrc.json`
- ESLint 配置文件
- 定義了 JavaScript 代碼檢查規則

### `package.json`
- 包含測試工具依賴和測試腳本
- **注意**: 此文件僅用於 CI/CD，不影響專案的實際運行

## 常見問題

### Q: 測試失敗了，我還能推送代碼嗎？
A: 可以。測試失敗不會阻止代碼推送，但建議修復問題後再推送到 main。

### Q: 如何修復 ESLint 錯誤？
A: 可以運行 `npx eslint js/**/*.js --fix` 自動修復部分問題，或手動修復。

### Q: 連結檢查失敗怎麼辦？
A: 檢查失敗的連結是否真的無法訪問，如果是外部連結暫時無法訪問，可以忽略。內部連結應該修復。

### Q: 無障礙性檢查有很多警告？
A: 部分無障礙性問題可能不影響功能，但建議逐步改進以提升用戶體驗。

### Q: 可以在本地運行所有測試嗎？
A: 可以，運行 `npm test` 即可。但無障礙性檢查需要本地伺服器。

## 技術支援

如有任何問題，請：
1. 查看 GitHub Actions 的詳細錯誤訊息
2. 檢查本文件的常見問題部分
3. 提交 Issue 到 GitHub 倉庫

---

**最後更新**: 2025-01-XX
**維護者**: Hsiung-Shao
