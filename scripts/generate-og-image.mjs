// 生成 OG image (1200×630) 給社群分享預覽用
// - 用 puppeteer headless 載入內嵌 HTML/CSS，screenshot 為 PNG
// - 一次性執行：npm run generate-og-image
// - 產物寫到 root/og-image.png，由 copy-static-assets.js 複製到 build/

import puppeteer from 'puppeteer';
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, '..', 'og-image.png');

// 內嵌 HTML — 自包含、不依賴外部資源（除了 Google Fonts，puppeteer 會等載入）
const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;800&family=Noto+Sans+TC:wght@500;700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: 'Noto Sans TC', 'Inter', sans-serif;
    background:
      radial-gradient(circle at 15% 20%, rgba(124, 58, 237, 0.45) 0%, transparent 50%),
      radial-gradient(circle at 85% 80%, rgba(220, 38, 38, 0.35) 0%, transparent 50%),
      linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #0f172a 100%);
    color: #fff;
    display: flex;
    flex-direction: column;
    padding: 60px 70px;
    position: relative;
  }
  /* 左上 brand */
  .brand {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .brand-icon {
    width: 64px;
    height: 64px;
    background: linear-gradient(135deg, #a855f7, #7c3aed);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 40px rgba(124, 58, 237, 0.6);
  }
  .brand-icon svg { width: 36px; height: 36px; }
  .brand-name {
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -0.5px;
    background: linear-gradient(90deg, #ffffff, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* 中央主標 */
  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin-top: 20px;
  }
  .title {
    font-size: 88px;
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: -2px;
    margin-bottom: 28px;
  }
  .title .accent {
    background: linear-gradient(90deg, #a78bfa 0%, #ec4899 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .subtitle {
    font-size: 30px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.78);
    line-height: 1.4;
    max-width: 900px;
  }

  /* 底部 */
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 40px;
  }
  .platforms {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .platform {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 22px;
    font-weight: 700;
    padding: 12px 22px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(10px);
  }
  .platform svg { width: 28px; height: 28px; }
  .platform.twitch { color: #c4b5fd; }
  .platform.twitch svg { fill: #9146ff; }
  .platform.youtube { color: #fca5a5; }
  .platform.youtube svg { fill: #ff0000; }

  .url {
    font-family: 'Inter', sans-serif;
    font-size: 22px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.55);
    letter-spacing: 0.5px;
  }

  /* 裝飾元素：4 格 mockup 縮影右上 */
  .mockup {
    position: absolute;
    top: 60px;
    right: 70px;
    width: 280px;
    height: 175px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 6px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.15);
    transform: rotate(2deg);
  }
  .mockup .cell {
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.4), rgba(30, 27, 75, 0.6));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
  }
  .mockup .cell.live::before {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
    margin-top: -50px;
    margin-left: -100px;
    box-shadow: 0 0 12px #ef4444;
  }
</style>
</head>
<body>
  <div class="mockup">
    <div class="cell live">🎮</div>
    <div class="cell">📺</div>
    <div class="cell">🎤</div>
    <div class="cell live">🎬</div>
  </div>

  <div class="brand">
    <div class="brand-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    </div>
    <div class="brand-name">MultiStream Hub</div>
  </div>

  <div class="hero">
    <div class="title">
      <span class="accent">多直播</span>同步觀看工具
    </div>
    <div class="subtitle">
      免費同時觀看多個 Twitch 與 YouTube 直播<br>
      多種布局、聊天室整合、無需註冊
    </div>
  </div>

  <div class="footer">
    <div class="platforms">
      <div class="platform twitch">
        <svg viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>
        Twitch
      </div>
      <div class="platform youtube">
        <svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        YouTube
      </div>
    </div>
    <div class="url">multistreaming.org</div>
  </div>
</body>
</html>`;

async function main() {
  console.log('▶ 生成 OG image...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  // 多等一點讓 webfont 完成 layout
  await page.evaluateHandle('document.fonts.ready');

  const buffer = await page.screenshot({ type: 'png', omitBackground: false });
  await writeFile(OUTPUT, buffer);

  await browser.close();
  console.log(`✓ ${OUTPUT}`);
}

main().catch(err => {
  console.error('OG image 生成失敗:', err);
  process.exit(1);
});
