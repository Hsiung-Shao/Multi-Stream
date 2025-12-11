// 構建後腳本：複製靜態資源到 build 目錄
const fs = require('fs');
const path = require('path');

console.log('[copy-static-assets] 開始複製靜態資源...');

const rootDir = path.resolve(__dirname, '..');
const buildDir = path.resolve(rootDir, 'build');

// 確保 build 目錄存在
if (!fs.existsSync(buildDir)) {
  console.error('[copy-static-assets] build 目錄不存在，請先執行 vite build');
  process.exit(1);
}

// 需要複製的文件和目錄
const staticAssets = [
  'icon.png',
  'config.js',
  'js',
  'functions',
  'robots.txt',
  'sitemap.xml',
  'ads.txt',
  '_headers',
  'about.html',
  'privacy.html',
  'terms.html',
  'google4fd4a3e732a2da10.html'
];

// 複製文件的函數
function copyFile(src, dest) {
  try {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    console.log(`[copy-static-assets] ✓ 已複製: ${path.relative(rootDir, src)} -> ${path.relative(rootDir, dest)}`);
    return true;
  } catch (error) {
    console.error(`[copy-static-assets] ✗ 複製失敗: ${path.relative(rootDir, src)}`, error.message);
    return false;
  }
}

// 複製目錄的函數
function copyDir(src, dest) {
  try {
    if (!fs.existsSync(src)) {
      console.warn(`[copy-static-assets] ⚠ 源目錄不存在: ${path.relative(rootDir, src)}`);
      return false;
    }
    
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        copyFile(srcPath, destPath);
      }
    }
    
    console.log(`[copy-static-assets] ✓ 已複製目錄: ${path.relative(rootDir, src)} -> ${path.relative(rootDir, dest)}`);
    return true;
  } catch (error) {
    console.error(`[copy-static-assets] ✗ 複製目錄失敗: ${path.relative(rootDir, src)}`, error.message);
    return false;
  }
}

// 執行複製
let successCount = 0;
let failCount = 0;

staticAssets.forEach(asset => {
  const srcPath = path.resolve(rootDir, asset);
  const destPath = path.resolve(buildDir, asset);
  
  if (!fs.existsSync(srcPath)) {
    console.warn(`[copy-static-assets] ⚠ 源文件/目錄不存在: ${asset}`);
    failCount++;
    return;
  }
  
  const stats = fs.statSync(srcPath);
  if (stats.isDirectory()) {
    if (copyDir(srcPath, destPath)) {
      successCount++;
    } else {
      failCount++;
    }
  } else {
    if (copyFile(srcPath, destPath)) {
      successCount++;
    } else {
      failCount++;
    }
  }
});

console.log(`[copy-static-assets] 複製完成: 成功 ${successCount} 個，失敗 ${failCount} 個`);

// 驗證 icon.png 是否已複製
const iconPath = path.resolve(buildDir, 'icon.png');
if (fs.existsSync(iconPath)) {
  console.log(`[copy-static-assets] ✓ icon.png 已成功複製到構建目錄`);
} else {
  console.error(`[copy-static-assets] ✗ icon.png 複製失敗，請檢查`);
  process.exit(1);
}

