// Prerender 公開頁面為靜態 HTML
// - 啟動 sirv 服務 build/，puppeteer 訪問每個 lang × route，把渲染後的 HTML 寫回對應路徑
// - 注入 window.__PRERENDER__ = true 以阻止 GA 在 prerender 期間發送事件
// - 攔截 Twitch/YouTube/AdSense 等第三方 request 加速且避免污染
// - 路徑列表必須與 scripts/generate-sitemap.js 的 ROUTES / LANGS 對齊

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import sirv from 'sirv';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = resolve(__dirname, '..', 'build');
const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const LANGS = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];
const ROUTES = ['/', '/tools', '/canvas', '/faq', '/about', '/instructions', '/privacy'];

// 攔截掉這些第三方 request，prerender 不需要它們，加速且避免外連
const BLOCKED_HOSTS = [
  'pagead2.googlesyndication.com',
  'googletagmanager.com',
  'google-analytics.com',
  'doubleclick.net',
  'static.cloudflareinsights.com',
  'cloudflareinsights.com',
  'player.twitch.tv',
  'youtube.com',
  'youtubei.com',
  'ipapi.co',
];

function buildPath(lang, route) {
  return route === '/' ? `/${lang}` : `/${lang}${route}`;
}

function outputFile(lang, route) {
  // /zh-TW/  → build/zh-TW/index.html
  // /zh-TW/about → build/zh-TW/about/index.html
  const dir = route === '/' ? resolve(BUILD_DIR, lang) : resolve(BUILD_DIR, lang, route.replace(/^\//, ''));
  return resolve(dir, 'index.html');
}

async function startServer() {
  // sirv 處理 SPA fallback：未匹配的路徑回傳 build/index.html
  const handler = sirv(BUILD_DIR, { single: true, dev: false, etag: false });
  return new Promise((res, rej) => {
    const server = http.createServer(handler);
    server.on('error', rej);
    server.listen(PORT, '127.0.0.1', () => res(server));
  });
}

async function prerenderPage(browser, urlPath) {
  const page = await browser.newPage();

  // prerender 標記必須在頁面任何 script 執行前注入
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(window, '__PRERENDER__', { value: true, writable: false });
  });

  // 攔截第三方 request
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (BLOCKED_HOSTS.some(h => url.includes(h))) {
      req.abort();
      return;
    }
    req.continue();
  });

  page.on('pageerror', err => {
    console.warn(`  [pageerror ${urlPath}]`, err.message);
    if (err.stack) console.warn(`    stack:\n${err.stack.split('\n').slice(0, 8).map(l => '      ' + l).join('\n')}`);
  });
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.warn(`  [console.${msg.type()} ${urlPath}]`, msg.text().slice(0, 300));
    }
  });

  await page.goto(`${ORIGIN}${urlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

  // 等到 React 渲染出實際內容（root 內容非空）
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#root');
      return root && root.children.length > 0;
    },
    { timeout: 15000 }
  );

  const html = await page.content();
  await page.close();
  return html;
}

async function main() {
  console.log(`▶ Prerender 啟動，輸出目錄：${BUILD_DIR}`);
  const server = await startServer();
  console.log(`  本地 server 起在 ${ORIGIN}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  console.log(`  Chromium launched`);

  const tasks = [];
  for (const lang of LANGS) {
    for (const route of ROUTES) {
      tasks.push({ lang, route, urlPath: buildPath(lang, route) });
    }
  }
  console.log(`  共 ${tasks.length} 個路徑待 prerender`);

  let success = 0;
  let failed = 0;
  for (const { lang, route, urlPath } of tasks) {
    try {
      const html = await prerenderPage(browser, urlPath);
      const out = outputFile(lang, route);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, html, 'utf8');
      success++;
      console.log(`  ✓ ${urlPath} → ${out.replace(BUILD_DIR, 'build')}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${urlPath} 失敗:`, err.message);
    }
  }

  await browser.close();
  await new Promise(res => server.close(res));

  console.log(`\n▶ 完成：${success} 成功 / ${failed} 失敗`);
  // Prerender 失敗不 fail build：失敗的路徑 Cloudflare Pages 會 fallback 到
  // build/index.html (SPA mode)，user 端仍能 client-side render。SEO 層面
  // 暫時失去 prerender 優化，但避免 client app 任何小問題阻擋整個 deploy。
  // failed > 0 時印 warn 提醒 monitor，但 exit 0 讓 build 過。
  if (failed > 0) {
    console.warn(`⚠️  ${failed} 個路徑 prerender 失敗，已 fallback 到 SPA index.html。請檢查 client app TDZ/初始化 error。`);
  }
}

main().catch(err => {
  console.error('Prerender 致命錯誤:', err);
  // 即使 main 拋例外（puppeteer launch 失敗等）也讓 build 過
  console.warn('⚠️  Prerender main 失敗，全部 path fallback 到 SPA index.html。');
  process.exit(0);
});
