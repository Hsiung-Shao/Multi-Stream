/**
 * client 的 vendor 分包（vite.config.ts 的 manualChunks），依「套件名」精準分類（2026-09 PageSpeed 優化）。
 *
 * 原本用物件形式 { 'vendor-radix': [...10 個 Radix] } 有兩個問題：
 * - 首頁得一次下載全部 Radix。
 * - 物件形式只認領列出的入口，並把入口的依賴一起拖進去。react-dom 的 client 本體（react-dom/client 與
 *   scheduler）因此藏在 vendor-radix 裡，vendor-radix 才會有 gzip 約 91 KB。拿掉 Radix 群組後，它們改跑進
 *   vendor-charts，首頁反而預載整包圖表庫。
 * 改成函式：只把明確列出的套件放進指定 chunk；Radix 等其餘套件不指定，交給 Rollup 依使用點分配。
 * 放在獨立檔是為了能寫單元測試（tests/buildConfig/vendorChunks.test.ts）。
 */
const VENDOR_CHUNKS: Record<string, string[]> = {
    'vendor-react': ['react', 'react-dom', 'scheduler', 'zustand', '@tanstack/react-query', '@tanstack/query-core'],
    // 圖表庫只在後台用到；d3-* 在下方另外比對
    'vendor-charts': ['recharts', 'recharts-scale', 'react-smooth', 'decimal.js-light', 'internmap', 'eventemitter3'],
    'vendor-utils': ['clsx', 'tailwind-merge', 'i18next', 'react-i18next', 'lucide-react'],
};

const PKG_TO_CHUNK = new Map(Object.entries(VENDOR_CHUNKS).flatMap(([chunk, pkgs]) => pkgs.map(p => [p, chunk] as const)));

/** 模組 id（檔案路徑）→ chunk 名稱；不在清單內回 undefined（交給 Rollup） */
export function vendorChunkOf(id: string): string | undefined {
    // 取最後一段 node_modules：巢狀安裝（a/node_modules/b）的檔案屬於 b
    const matches = [...id.matchAll(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/g)];
    if (matches.length === 0) return undefined;
    const pkg = matches[matches.length - 1][1].replace(/\\/g, '/');
    if (pkg.startsWith('d3-')) return 'vendor-charts';
    return PKG_TO_CHUNK.get(pkg);
}
