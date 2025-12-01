# Cloudflare Pages 環境變數設定指南

本指南將幫助您在 Cloudflare Pages 中正確設定 Twitch API 所需的環境變數。

## 📋 概述

本專案使用 Cloudflare Pages Functions 來安全地處理 Twitch API 認證。需要在 Cloudflare Pages 中設定以下環境變數：

- `TWITCH_CLIENT_ID` - Twitch API Client ID（使用 Variables）
- `TWITCH_CLIENT_SECRET` - Twitch API Client Secret（使用 Secrets，敏感資訊）

## 🔧 設定步驟

### 步驟 1：獲取 Twitch API 憑證

如果您還沒有 Twitch API 憑證：

1. 前往 [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. 登入您的 Twitch 帳號
3. 點擊「Register Your Application」或選擇現有應用
4. 填寫應用資訊：
   - **Name**: 您的應用名稱（例如：MultiStream Hub）
   - **OAuth Redirect URLs**: `https://your-domain.pages.dev`（您的 Cloudflare Pages 網址）
   - **Category**: 選擇適當的分類
5. 建立後即可看到 **Client ID**
6. 點擊「New Secret」按鈕生成 **Client Secret**（只會顯示一次，請妥善保存）

### 步驟 2：在 Cloudflare Pages 中設定環境變數

1. **進入 Cloudflare Dashboard**
   - 前往 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 登入您的帳號

2. **選擇您的 Pages 專案**
   - 在左側選單中點擊「Workers & Pages」
   - 選擇「Pages」
   - 點擊您的專案名稱

3. **進入環境變數設定**
   - 點擊頂部選單的「Settings」
   - 在左側選單中找到「Variables & Secrets」
   - 點擊進入

4. **設定 TWITCH_CLIENT_ID（使用 Variables）**
   - 在「Variables」標籤中，點擊「Add variable」
   - 輸入變數名稱：`TWITCH_CLIENT_ID`
   - 輸入變數值：您的 Twitch Client ID
   - ⚠️ **重要**：在「Environment」下拉選單中，選擇「All environments」或同時選擇「Production」和「Preview」
   - 點擊「Save」

5. **設定 TWITCH_CLIENT_SECRET（使用 Secrets）**
   - 切換到「Secrets」標籤
   - 點擊「Add secret」
   - 輸入變數名稱：`TWITCH_CLIENT_SECRET`
   - 輸入變數值：您的 Twitch Client Secret
   - ⚠️ **重要**：在「Environment」下拉選單中，選擇「All environments」或同時選擇「Production」和「Preview」
   - 點擊「Save」

### 步驟 3：重新部署專案

設定環境變數後，需要重新部署專案才能生效：

1. 在 Pages 專案頁面，點擊「Deployments」標籤
2. 找到最新的部署記錄
3. 點擊右側的「⋯」選單，選擇「Retry deployment」或「Redeploy」
4. 等待部署完成

## 🔍 驗證設定

設定完成後，可以使用以下方式驗證：

訪問 Token 端點：
```
https://your-domain.pages.dev/api/twitch-token
```

如果配置正確，會返回 Twitch Access Token。如果配置錯誤，會顯示錯誤信息。

## ❗ 常見問題

### 問題 1：環境變數未生效

**原因**：
- 只設定了 Production 環境，忘記設定 Preview 環境
- 設定後忘記重新部署

**解決方法**：
1. 檢查環境變數的「Environment」設定，確保同時選擇了「Production」和「Preview」
2. 重新部署專案

### 問題 2：變數名稱錯誤

**原因**：
- 變數名稱大小寫錯誤（應該是 `TWITCH_CLIENT_ID` 而不是 `twitch_client_id`）
- 拼寫錯誤

**解決方法**：
1. 檢查變數名稱是否完全正確（大小寫敏感）
2. 變數名稱應該是：`TWITCH_CLIENT_ID` 和 `TWITCH_CLIENT_SECRET`

### 問題 3：Secrets 類型錯誤

**原因**：
- 將 `TWITCH_CLIENT_SECRET` 設定為 Variables 而不是 Secrets

**解決方法**：
1. `TWITCH_CLIENT_SECRET` 必須使用「Secrets」標籤，而不是「Variables」
2. 刪除錯誤的設定，重新在「Secrets」標籤中添加

### 問題 4：本地可以運行，但 Cloudflare 不行

**原因**：
- 本地使用 `config.js` 文件，但 Cloudflare Pages 需要環境變數
- 環境變數未正確設定

**解決方法**：
1. 確認已在 Cloudflare Pages 中設定環境變數
2. 確認重新部署了專案
3. 檢查 `/api/twitch-token` 端點是否正常運作

## 📝 環境變數列表

| 變數名稱 | 類型 | 說明 | 是否必需 |
|---------|------|------|---------|
| `TWITCH_CLIENT_ID` | Variable | Twitch API Client ID | ✅ 是 |
| `TWITCH_CLIENT_SECRET` | Secret | Twitch API Client Secret | ✅ 是 |

## 🔗 相關資源

- [Cloudflare Pages 環境變數文檔](https://developers.cloudflare.com/pages/platform/build-configuration/#environment-variables)
- [Twitch Developer Console](https://dev.twitch.tv/console/apps)
- [Twitch API 認證文檔](https://dev.twitch.tv/docs/authentication/)

## 💡 提示

- 🔒 **安全性**：Client Secret 是敏感資訊，務必使用「Secrets」而不是「Variables」
- 🌍 **環境**：記得同時設定 Production 和 Preview 環境
- 🔄 **部署**：每次修改環境變數後都需要重新部署
- 🧪 **測試**：使用 `/api/twitch-token` 端點驗證配置

## 🆘 需要幫助？

如果遇到問題：

1. 訪問 `/api/twitch-token` 查看錯誤詳情
2. 檢查 Cloudflare Pages Functions 日誌
3. 確認 Twitch API 憑證是否有效
4. 確認環境變數已正確設定並重新部署

---

**最後更新**：2025-01-XX
