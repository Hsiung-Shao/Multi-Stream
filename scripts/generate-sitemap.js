const { SitemapStream, streamToPromise } = require('sitemap');
const { createWriteStream } = require('fs');
const path = require('path');

// 獲取當前日期（ISO 格式：YYYY-MM-DD）
const today = new Date().toISOString().split('T')[0];

// 定義網站的所有路由
const urls = [
  { url: '/', changefreq: 'daily', priority: 1.0, lastmod: today },
  { url: '/about', changefreq: 'monthly', priority: 0.8, lastmod: today },
  { url: '/privacy', changefreq: 'monthly', priority: 0.8, lastmod: today },
];

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
