// 產生 multistreaming.org 的 sitemap.xml
// - 5 語言 × 6 公開頁 = 30 entries
// - 每個 entry 含 xhtml:link alternate 指向其餘 4 語言版本 + x-default
// - 與 src/lib/i18nRouting.ts 的 SUPPORTED_LANGS / 路由一致

const { SitemapStream, streamToPromise } = require('sitemap');
const { createWriteStream } = require('fs');
const path = require('path');

const today = new Date().toISOString().split('T')[0];
const hostname = 'https://multistreaming.org';

const LANGS = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];
const X_DEFAULT_LANG = 'en';

// 子路徑（不含 lang prefix）。priority/changefreq 按頁面重要性。
const ROUTES = [
  { subpath: '/', changefreq: 'weekly', priority: 1.0 },
  { subpath: '/tools', changefreq: 'weekly', priority: 0.9 },
  { subpath: '/canvas', changefreq: 'weekly', priority: 0.9 },
  { subpath: '/faq', changefreq: 'monthly', priority: 0.8 },
  { subpath: '/about', changefreq: 'monthly', priority: 0.7 },
  { subpath: '/instructions', changefreq: 'monthly', priority: 0.7 },
  { subpath: '/privacy', changefreq: 'yearly', priority: 0.3 },
];

const buildLangPath = (lang, subpath) => (subpath === '/' ? `/${lang}` : `/${lang}${subpath}`);

const outputPath = path.resolve(__dirname, '..', 'sitemap.xml');
const sitemap = new SitemapStream({ hostname });
const writeStream = createWriteStream(outputPath);
sitemap.pipe(writeStream);

ROUTES.forEach(({ subpath, changefreq, priority }) => {
  LANGS.forEach(lang => {
    const links = LANGS.map(l => ({
      lang: l,
      url: `${hostname}${buildLangPath(l, subpath)}`,
    }));
    links.push({ lang: 'x-default', url: `${hostname}${buildLangPath(X_DEFAULT_LANG, subpath)}` });

    sitemap.write({
      url: buildLangPath(lang, subpath),
      changefreq,
      priority,
      lastmod: today,
      links,
    });
  });
});

sitemap.end();

streamToPromise(sitemap)
  .then(() => {
    console.log(`✅ Sitemap 已成功生成 (${ROUTES.length * LANGS.length} entries): ${outputPath}`);
  })
  .catch((error) => {
    console.error('❌ 生成 sitemap 時發生錯誤:', error);
    process.exit(1);
  });
