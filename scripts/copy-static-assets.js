// 構建後腳本：複製靜態資源到 build 目錄
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const buildDir = path.resolve(rootDir, 'build');

// 確保 build 目錄存在
if (!fs.existsSync(buildDir)) {
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
  'manifest.json',
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
    return true;
  } catch (error) {
    return false;
  }
}

// 複製目錄的函數
function copyDir(src, dest) {
  try {
    if (!fs.existsSync(src)) {
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
    
    return true;
  } catch (error) {
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

// 驗證 icon.png 是否已複製
const iconPath = path.resolve(buildDir, 'icon.png');
if (!fs.existsSync(iconPath)) {
  process.exit(1);
}

