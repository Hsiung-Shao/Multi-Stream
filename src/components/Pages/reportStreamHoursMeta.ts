/** 資料報告的 schema 常數（App.tsx 用；獨立檔避免為了日期把整頁與 JSON 拉進首屏 chunk）。dateModified 要跟快照的 generatedAt 一起換 */
export const REPORT_STREAM_HOURS_META = {
    datePublished: '2026-11-26',
    dateModified: '2026-11-26',
    image: '/docs/tutorial/schedule-selected.webp',
    faqCount: 3,
} as const;
