# Cloudflare Zaraz GA4 停用步驟

> 本專案已改用 native gtag.js 直接送 GA4，**必須停用 Cloudflare Zaraz 的 GA4 整合**，否則會雙計事件、跳出率持續失真。

## 為什麼要停用

Zaraz 的 GA4 模板**不會收集 `user_engagement` 事件**，導致 GA4 判定大部分工作階段沒有互動 → 跳出率被推高到 99%。同時若程式碼端的 native gtag.js 也送同樣事件，會雙計。

詳細根因：**Zaraz GA4 整合**只送 page_view 與少數自訂事件，缺少 GA4 SDK 預設應送的 `user_engagement`（使用者實際停留 ≥ 10 秒並有互動才送）。GA4 沒收到 `user_engagement` → engaged_session = 0 → bounce_rate = 100%。

## 停用步驟（5 分鐘）

### 1. 進入 Cloudflare 後台

打開 [https://dash.cloudflare.com](https://dash.cloudflare.com) → 選 `multistreaming.org` zone。

### 2. 找到 Zaraz

左側選單 → **Zaraz** → **Tools configuration**（或「工具設定」）。

### 3. 找到 GA4 工具

在已設定的工具清單裡找「Google Analytics」項目（顯示 measurement ID `G-Q2LXVMDD46`）。

### 4. 停用方式（擇一）

- **A 推薦：暫時停用**
  該工具卡片右上角有 toggle / 開關，切到 **OFF**。設定保留，可隨時還原。

- **B 永久移除**
  點工具卡片進入詳細頁 → **刪除** / **Remove tool**。設定永久消失。

### 5. 發布變更

回到 Zaraz 主頁 → 右上角 **Publish**（發布）。等待 ~30 秒生效。

## 驗證

在正式網站 multistreaming.org 開瀏覽器 DevTools → Network → filter `collect?v=2`：

- **正確**：每次造訪 / 路由切換時，看到**一個** `https://www.google-analytics.com/g/collect?v=2&...&en=page_view` 請求
- **錯誤**：看到**兩個**幾乎同時的 page_view 請求 → Zaraz 還在送，回 Cloudflare 後台確認停用狀態

也可在 GA4 → 即時 → DebugView 觀察 24 小時：

- 正確：每次刷新只 1 個 page_view
- 錯誤：刷新一次顯示 2 個 page_view → Zaraz 仍在運作

## 回退方案

若停 Zaraz 後發現 GA4 沒任何資料進來（可能 native gtag.js 部署有問題），重新打開 Cloudflare Zaraz → 把該 GA4 工具切回 **ON** → 發布。資料會立刻恢復。

回退期間可暫時容忍雙計，等 native gtag.js 修好後再次停 Zaraz。
