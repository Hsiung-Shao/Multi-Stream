# GTM (GTM-WS5W6JWC) 處置紀錄

## 結論

**已從 [index.html](../index.html) 移除 GTM script + noscript iframe**，由 native gtag.js（[src/utils/analytics.ts](../src/utils/analytics.ts)）完整接管。

## 為什麼移除

### 1. GTM 後台只有 3 個 tag，全屬 stream_heartbeat 系列

| Tag 名稱 | 觸發條件 | 行為 |
|---|---|---|
| HTML-Mutation Observer for container | windows load | 等 React 把 `#container` render 出來，推自訂事件到 dataLayer |
| HTML-Start Heartbeat Interval | T-Container-Loaded | 每 30 秒 push `stream_heartbeat_tick_internal` 到 dataLayer，30 分鐘後自動 clearInterval |
| Google Analytics GA4 事件 | T-Heartbeat-Tick-Internal | 把上面的 dataLayer tick 送成 GA4 `stream_heartbeat` 事件（無業務參數） |

### 2. 這個版本是 99% 跳出率的元兇之一

GTM 送出的 `stream_heartbeat` 是空殼事件 — 沒有 `user_engagement` 也沒有業務參數（stream_count、platforms 等）。GA4 判定整段工作階段沒有 engagement → bounce_rate 暴升。

加上 30 分鐘後 GTM 自動停止 → 後續看直播 1 小時都是 ghost session。

### 3. native gtag.js 完整取代

新的 [src/hooks/useStreamHeartbeat.ts](../src/hooks/useStreamHeartbeat.ts) 實作：

- 每 60 秒送 `stream_heartbeat`，帶 `stream_count` / `platforms` / `total_watch_seconds` / `is_active`
- 不會 30 分鐘後停（持續到 visibilitychange / pagehide）
- visibility 處理：背景時暫停計時、發 `session_pause`；回前景發 `session_resume`
- pagehide 發 `session_end` 帶 `total_watch_seconds` + `max_concurrent_streams`
- sessionStorage 持久化累計秒數，跨頁面重整不歸零

### 4. codebase 沒有任何業務 dataLayer 事件依賴 GTM

全 codebase 只有 [src/features/analytics/IdentityManager.ts](../src/features/analytics/IdentityManager.ts) 一處 `dataLayer.push({event: 'ms_identity_ready'})` — 是匿名身分識別的輔助訊號，沒有業務影響。

新版 boot stub（index.html 內）保留 `window.dataLayer = []`，這個 push 仍可正常執行，只是沒有 GTM 在接而已。

### 5. 沒有其他重要 GTM tag

確認過 codebase + GTM 後台：
- ❌ 沒有 Google Ads conversion tag
- ❌ 沒有 Facebook Pixel / 其他第三方 analytics
- ❌ AdSense 是直接 script 載入（[index.html L151](../index.html#L151)），不靠 GTM
- ❌ Cloudflare Insights 走獨立 endpoint

## 你需要做的（GTM 後台清理）

進 [https://tagmanager.google.com](https://tagmanager.google.com) → 選 `GTM-WS5W6JWC` 容器：

### 推薦：暫停 3 個 tag（可逆）

每個 tag 點進去 → 找「**暫停代碼**」/ pause toggle → 開啟 → 提交版本

- ☐ HTML-Mutation Observer for container
- ☐ HTML-Start Heartbeat Interval
- ☐ Google Analytics GA4 事件

留著容器與 tag，方便將來真的需要 GTM 時還原。

### 進階：刪除整個容器（不可逆，不推薦）

GTM 容器設定 → 管理 → 刪除容器。會永久消失。除非你確定永遠不會用 GTM，否則不建議。

## 還原方法（萬一需要）

把以下兩段加回 [index.html](../index.html)：

**`<head>` 區塊（在 GA4 boot stub 之後）：**
```html
<script>(function (w, d, s, l, i) {
    w[l] = w[l] || []; w[l].push({
      'gtm.start': new Date().getTime(), event: 'gtm.js'
    }); var f = d.getElementsByTagName(s)[0],
      j = d.createElement(s), dl = l != 'dataLayer' ? '&l=' + l : ''; j.async = true; j.src =
        'https://www.googletagmanager.com/gtm.js?id=' + i + dl; f.parentNode.insertBefore(j, f);
  })(window, document, 'script', 'dataLayer', 'GTM-WS5W6JWC');</script>
```

**`<body>` 開頭：**
```html
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-WS5W6JWC" height="0" width="0"
    style="display:none;visibility:hidden"></iframe></noscript>
```

CSP 在 [_headers](../_headers) 仍保留 `*.googletagmanager.com` 允許清單，無需另外調整。
