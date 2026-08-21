const { SitemapStream, streamToPromise } = require('sitemap');
const { createWriteStream } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 獲取當前日期（ISO 格式：YYYY-MM-DD）——僅作 git 失敗時的 fallback
const today = new Date().toISOString().split('T')[0];

// 每條路由的代表性內容來源檔：lastmod = 這些檔案最後一次 commit 的日期。
// Google 若判定 lastmod 不可靠（每次 build 整批刷新）會整份忽略，故改用 git 真實異動日期。
// 刻意不含 zh-TW/common.ts（混雜 cookie/mobile 等非頁面文案，會造成假性更新）。
const ROUTE_SOURCES = {
  '/': ['src/components/Pages/LandingPage.tsx', 'src/seo/defaults.ts', 'index.html'],
  '/canvas': ['src/components/Pages/NewCanvasPage.tsx', 'src/components/Canvas/CanvasEmptyState.tsx'],
  '/instructions': ['src/components/Pages/InstructionsPage.tsx', 'src/i18n/locales/zh-TW/tutorial.ts'],
  '/about': ['src/components/AboutPage.tsx', 'src/i18n/locales/zh-TW/about.ts'],
  '/privacy': ['src/components/PrivacyPage.tsx', 'src/i18n/locales/zh-TW/privacy.ts'],
  '/faq': ['src/components/FAQPage.tsx', 'src/i18n/locales/zh-TW/faq.ts'],
  '/support': ['src/components/SupportPage.tsx', 'src/i18n/locales/zh-TW/support.ts'],
  '/about/creator': ['src/components/Pages/CreatorPage.tsx', 'src/i18n/locales/zh-TW/about.ts'],
  // 教學文章 7 篇（slug 清單與 src/config/guides.ts 的 GUIDE_SLUGS 一致；tests/functions/sitemap.test.ts 鎖）
  ...Object.fromEntries(
    ['quick-start', 'canvas', 'search', 'dynamic-island', 'favorites', 'media', 'settings'].map((s) => [
      `/instructions/${s}`,
      ['src/components/Pages/InstructionsPage.tsx', 'src/i18n/locales/zh-TW/tutorial.ts'],
    ])
  ),
};

function gitLastMod(files) {
  try {
    const out = execSync(
      `git log -1 --format=%cI -- ${files.map((f) => JSON.stringify(f)).join(' ')}`,
      { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    // 空輸出（shallow clone 邊界、檔案不存在）→ 退回今天（= 舊行為，不會更糟）
    return out ? out.slice(0, 10) : today;
  } catch {
    return today;
  }
}

// 定義網站的所有路由
const urls = [
  { url: '/', changefreq: 'daily', priority: 1.0 },
  { url: '/canvas', changefreq: 'weekly', priority: 0.9 },
  { url: '/instructions', changefreq: 'monthly', priority: 0.8 },
  { url: '/about', changefreq: 'monthly', priority: 0.7 },
  { url: '/privacy', changefreq: 'monthly', priority: 0.6 },
  { url: '/faq', changefreq: 'monthly', priority: 0.6 },
  { url: '/support', changefreq: 'monthly', priority: 0.5 },
  { url: '/about/creator', changefreq: 'yearly', priority: 0.4 },
  ...['quick-start', 'canvas', 'search', 'dynamic-island', 'favorites', 'media', 'settings'].map((s) => ({
    url: `/instructions/${s}`, changefreq: 'monthly', priority: 0.6,
  })),
].map((u) => ({ ...u, lastmod: gitLastMod(ROUTE_SOURCES[u.url]) }));

// 網站主機名
const hostname = 'https://multistreaming.org';

// 輸出文件路徑
const outputPath = path.resolve(__dirname, '..', 'sitemap.xml');

// 創建 sitemap stream
const sitemap = new SitemapStream({ hostname });
const writeStream = createWriteStream(outputPath);

// 將 sitemap stream 連接到寫入流
sitemap.pipe(writeStream);

// 添加所有 URL
urls.forEach(url => {
  sitemap.write(url);
});

// 結束 stream
sitemap.end();

// 等待 sitemap stream 完成（而不是 writeStream）
streamToPromise(sitemap)
  .then(() => {
    console.log(`✅ Sitemap 已成功生成: ${outputPath}`);
  })
  .catch((error) => {
    console.error('❌ 生成 sitemap 時發生錯誤:', error);
    process.exit(1);
  });
