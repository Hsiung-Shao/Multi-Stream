// 量測用靜態伺服器：純 Node（不經 vite，避開 Console Ninja 注入把 <meta charset> 擠出前 1024 bytes）
// 且一律 gzip —— 不 gzip 時 Lighthouse 的 Lantern 會用未壓縮 transfer size 估算，FCP/LCP 嚴重失真。
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(process.argv[2] || 'build');
const PORT = Number(process.argv[3] || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml']);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  let file = path.join(ROOT, rel);

  // 預渲染頁（build/_prerender/<lang>/<route>.html，scripts/prerender.mjs 產出）：
  // 對齊 functions/[[path]].js 的取檔規則（首頁 → root.html），語言用 en（Lighthouse / 無 Accept-Language 的爬蟲都是 en）。
  // 沒有預渲染檔的路由（/canvas、404）才落到下方 SPA fallback，與線上 Function 行為一致。
  const LANG = process.env.PRERENDER_LANG || 'en';
  if (!path.extname(rel)) {
    const pre = path.join(ROOT, '_prerender', LANG, rel === '/' ? 'root.html' : rel.replace(/^\//, '') + '.html');
    if (fs.existsSync(pre) && fs.statSync(pre).isFile()) file = pre;
  }
  // SPA fallback：非靜態資產一律回 index.html（對齊 Cloudflare Pages 的 /* -> /index.html 200）
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(ROOT, 'index.html');
  }

  const ext = path.extname(file).toLowerCase();
  const body = fs.readFileSync(file);
  const headers = {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  };

  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const gz = zlib.gzipSync(body);
    res.writeHead(200, { ...headers, 'content-encoding': 'gzip', 'content-length': gz.length });
    res.end(gz);
  } else {
    res.writeHead(200, { ...headers, 'content-length': body.length });
    res.end(body);
  }
}).listen(PORT, () => console.log(`static server on http://localhost:${PORT} serving ${ROOT}`));
