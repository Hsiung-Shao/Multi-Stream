// 教學截圖轉檔:image/ToDo/*.png → public/docs/tutorial/*.webp
//
// image/ToDo/ 整個目錄被 gitignore(草稿素材),中文原名 → 英文 slug 的對照表
// 以本腳本的 MAP 為單一事實來源(有版控、可追溯)。
//
// 規格:寬 > 1600 縮至 1600(不放大)、webp quality 82、輸出檔名 = slug.webp。
// 冪等:輸出固定、直接覆寫,重跑結果相同;MAP 內來源缺檔即失敗(exit 1)。
// 完成後印出每張 slug / 寬x高 / KB,以及可直接貼進 InstructionsPage 的 img(...) 片段。
//
// 用法:npm run convert-tutorial-images(或 node scripts/convert-tutorial-images.mjs)
// 日後新增截圖:放進 image/ToDo/ → 在 MAP 加一行 → 重跑。

import sharp from 'sharp';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const SRC_DIR = 'image/ToDo';
const OUT_DIR = 'public/docs/tutorial';
const MAX_WIDTH = 1600;
const QUALITY = 82;

// 中文原名 → 英文 slug(歸屬文章見 InstructionsPage 的文章資料)
const MAP = {
    'search.png': 'island-search-bar',
    'search1.png': 'search-twitch-results',
    '新增視窗.png': 'island-add-window',
    '新增空白視窗2.png': 'add-window-combo',
    '新增空白視窗3.png': 'add-window-stream',
    '新增空白視窗4.png': 'add-window-chat',
    '布局選擇.png': 'island-layout-picker',
    '自訂義布局3.png': 'window-drag-resize',
    '一鍵收藏收藏.png': 'island-save-canvas',
    '自訂義布局1.png': 'custom-layout-save',
    '自訂義布局2.png': 'custom-layout-saved',
    '自訂義布局4.png': 'layout-manager',
    '全螢幕.png': 'island-fullscreen',
    '清空畫面.png': 'island-clear-canvas',
    '返回首頁.png': 'island-home',
    '收藏清單.png': 'island-favorites-list',
    '螢幕擷取畫面 2026-06-09 162730.png': 'favorites-live-list',
    '螢幕擷取畫面 2026-06-09 162759.png': 'favorites-filter-category',
    '螢幕擷取畫面 2026-06-09 162810.png': 'favorites-filter-tags',
    '螢幕擷取畫面 2026-06-10 064122.png': 'favorites-add-dialog',
    '螢幕擷取畫面 2026-06-10 064131.png': 'favorites-manager',
    '膜體控制.png': 'island-media-control',
    '螢幕擷取畫面 2026-06-09 162702.png': 'window-media-controls',
    '收藏管理介面.png': 'island-settings', // 原檔名標錯:紅框實際標在設定齒輪
    '螢幕擷取畫面 2026-06-10 064145.png': 'settings-panel',

    // 2026-08-28 重拍(真實直播 tw:lofigirl + 真實聊天室,1440x900 深色)。
    // 檔名前綴 g- 代表 guides,與早期人工命名的草稿分開。
    'g-island-overview.png': 'island-overview',
    'g-island-add-menu.png': 'island-add-menu',
    'g-island-layout-picker.png': 'layout-picker-panel',
    'g-island-media-panel.png': 'media-control-panel',
    'g-island-share-toast.png': 'share-copied',
    'g-window-toolbar.png': 'window-toolbar',
    'g-hotkey-help.png': 'hotkey-help',
    'g-theater-mode.png': 'theater-mode',
    'g-settings-global.png': 'settings-global',
    'g-edge-dock.png': 'island-edge-dock',
};

// 刻意不轉的來源(過小 / 內容重複)
const SKIP = new Set(['新增空白視窗1.png']);

// slug 重複防呆
const slugs = Object.values(MAP);
if (new Set(slugs).size !== slugs.length) {
    throw new Error('duplicate slug in MAP');
}

await mkdir(OUT_DIR, { recursive: true });

const rows = [];
for (const [srcName, slug] of Object.entries(MAP)) {
    const src = path.join(SRC_DIR, srcName);
    await stat(src); // 缺檔直接拋錯 → exit 1
    const out = path.join(OUT_DIR, `${slug}.webp`);
    const info = await sharp(src)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toFile(out);
    rows.push({ slug: `${slug}.webp`, w: info.width, h: info.height, kb: Math.round(info.size / 1024) });
}

console.table(rows);
console.log(`total: ${rows.length} files, ${rows.reduce((s, r) => s + r.kb, 0)} KB`);
console.log('--- paste-ready dims ---');
rows.forEach((r) => console.log(`img('${r.slug}', ${r.w}, ${r.h}, tx('...'), tx('...'))`));

// 提醒:來源目錄裡有 PNG 既不在 MAP 也不在 SKIP → 可能是新截圖忘了映射
const files = await readdir(SRC_DIR);
files
    .filter((f) => f.toLowerCase().endsWith('.png') && !MAP[f] && !SKIP.has(f))
    .forEach((f) => console.warn(`[warn] unmapped source: ${f}`));
