# 本地測試 RSS 功能指南

## 問題說明

YouTube RSS 功能在本地測試時會遇到 CORS（跨域資源共享）問題，因為：
1. `functions/api/youtube-rss.js` 是 Cloudflare Pages Function，需要特殊環境才能運行
2. 直接調用 YouTube RSS URL 會被瀏覽器 CORS 政策阻止

## 解決方案

### 方案 1：使用 Wrangler 本地運行（推薦）

Wrangler 是 Cloudflare 的官方 CLI 工具，可以在本地運行 Cloudflare Pages Functions。

#### 安裝 Wrangler

```bash
npm install -D wrangler
```

或使用全局安裝：

```bash
npm install -g wrangler
```

#### 啟動本地開發服務器

```bash
npm run dev
```

或直接使用：

```bash
wrangler pages dev . --port 8788
```

這會啟動一個本地服務器，運行在 `http://localhost:8788`，並且會執行 `functions/` 目錄下的 Cloudflare Pages Functions。

#### 訪問應用

在瀏覽器中打開 `http://localhost:8788`，RSS 功能應該可以正常工作。

### 方案 2：使用瀏覽器擴展（臨時解決方案）

如果不想安裝 Wrangler，可以使用瀏覽器擴展來暫時解決 CORS 問題：

1. 安裝 CORS 擴展（如 "CORS Unblock" 或 "Allow CORS"）
2. 啟用擴展
3. 使用本地 HTTP 服務器訪問應用

⚠️ **注意**：這只是臨時解決方案，不建議用於生產環境。

### 方案 3：使用本地代理服務器

創建一個簡單的 Node.js 代理服務器：

```javascript
// proxy-server.js
const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3000;

const server = http.createServer((req, res) => {
  // 處理 RSS 代理請求
  if (req.url.startsWith('/api/youtube-rss')) {
    const parsedUrl = url.parse(req.url, true);
    const channelId = parsedUrl.query.channel_id;
    
    if (!channelId) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: '缺少 channel_id 參數' }));
      return;
    }
    
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    
    https.get(rssUrl, (youtubeRes) => {
      let data = '';
      youtubeRes.on('data', (chunk) => { data += chunk; });
      youtubeRes.on('end', () => {
        res.writeHead(200, {
          'Content-Type': 'application/xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
      });
    }).on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: err.message }));
    });
  } else {
    // 其他請求轉發到主服務器
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`代理服務器運行在 http://localhost:${PORT}`);
});
```

運行代理服務器：

```bash
node proxy-server.js
```

然後在主應用中使用 `http://localhost:3000/api/youtube-rss` 作為代理 URL。

## 推薦流程

1. **開發階段**：使用 Wrangler 本地運行（方案 1）
2. **測試階段**：部署到 Cloudflare Pages 進行完整測試
3. **生產環境**：使用 Cloudflare Pages 的正式部署

## 驗證 RSS 功能

配置完成後，可以通過以下方式驗證：

1. 打開瀏覽器開發者工具（F12）
2. 查看 Console 標籤
3. 嘗試添加一個 YouTube 直播到收藏
4. 查看是否有 `[YouTube RSS]` 相關的日誌輸出
5. 檢查是否有 CORS 錯誤

如果看到 `[YouTube RSS] RSS Feed 獲取成功` 的日誌，表示 RSS 功能正常工作。

