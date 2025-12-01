<!-- 5f3e7818-16c9-4347-8600-3c51ddc3e275 bfe4eb6b-f0ce-4173-9420-45415c5701d9 -->
# Cloudflare Pages 環境變數支援實作計劃

## 目標

讓 Twitch API 能夠從 Cloudflare Pages 的 Variables & Secrets 讀取配置，使用 Pages Functions 安全地處理 OAuth token 請求。

## 實作步驟

### 1. 創建 Cloudflare Pages Function

在專案根目錄創建 `functions/api/twitch-token.js`，用於處理 OAuth token 請求：

- 從 `env` 參數讀取 `TWITCH_CLIENT_ID` 和 `TWITCH_CLIENT_SECRET`
- 實現 Client Credentials Grant Flow
- 返回 Access Token 給前端
- 處理錯誤和速率限制

### 2. 修改 `js/twitch-api.js`

- 修改 `getAppAccessToken()` 函數，優先使用 Pages Function 端點（`/api/twitch-token`）
- 如果 Pages Function 可用，則調用它；否則回退到直接調用 Twitch OAuth（向後兼容）
- 更新配置讀取邏輯，支援從環境變數讀取 Client ID（可選，因為可以在前端使用）

### 3. 更新配置讀取邏輯

- 修改 `TWITCH_API_CONFIG` 的初始化邏輯
- 優先從環境變數讀取（通過檢測是否在 Cloudflare Pages 環境）
- 保持向後兼容：如果沒有環境變數，則從 `config.js` 或 `localStorage` 讀取

### 4. 更新 `config.js` 和文檔

- 在 `config.js` 中添加註釋說明 Cloudflare Pages 環境變數的優先級
- 更新 `config.js.example` 說明如何設定環境變數

## 技術細節

### Pages Function 端點

- 路徑：`/api/twitch-token`
- 方法：`GET` 或 `POST`
- 功能：使用環境變數中的 `TWITCH_CLIENT_ID` 和 `TWITCH_CLIENT_SECRET` 取得 Access Token
- 返回：`{ access_token: string, expires_in: number }`

### 前端調用邏輯

- 檢測是否在 Cloudflare Pages 環境（通過檢查 `window.location.hostname` 或嘗試調用 `/api/twitch-token`）
- 如果 Pages Function 可用，使用它；否則使用現有的直接調用方式

## 檔案變更

1. **新建檔案**：

- `functions/api/twitch-token.js` - Cloudflare Pages Function

2. **修改檔案**：

- `js/twitch-api.js` - 更新 `getAppAccessToken()` 和配置讀取邏輯
- `config.js` - 添加環境變數說明（可選）

3. **文檔更新**：

- `config.js.example` - 添加 Cloudflare Pages 環境變數設定說明
- `README.md` - 添加環境變數設定說明（可選）

### To-dos

- [ ] 創建 Cloudflare Pages Function (`functions/api/twitch-token.js`) 來處理 OAuth token 請求，從環境變數讀取 TWITCH_CLIENT_ID 和 TWITCH_CLIENT_SECRET
- [ ] 修改 `js/twitch-api.js` 中的 `getAppAccessToken()` 函數，優先使用 Pages Function 端點，保持向後兼容
- [ ] 更新配置讀取邏輯，支援從環境變數讀取（可選），保持與現有 config.js 和 localStorage 的兼容性
- [ ] 更新 `config.js.example` 和相關文檔，說明如何在 Cloudflare Pages 中設定環境變數