/**
 * SEO 單一來源常數。
 *
 * 同時被兩端使用：
 *   - 執行期：src/components/SEO.tsx（JS 渲染後覆寫 title / meta / canonical）
 *   - 建置期：vite.config.ts 的 seoHtmlPlugin（替換 index.html 的 %SEO_*% 佔位，
 *     讓伺服器直出的 HTML 與渲染後的值一致）
 *
 * ⚠ 此檔必須維持「純 TS、零 import」，vite.config.ts 會在 Node 端直接載入。
 */

export const SEO_SITE_URL = 'https://multistreaming.org';

/** 首頁與未指定 title 頁面的預設標題（≤ 60 字元，避免 SERP 截斷） */
export const SEO_DEFAULT_TITLE = 'MultiStream Hub｜免費 Twitch & YouTube 多直播同時觀看工具';

export const SEO_DEFAULT_DESCRIPTION =
  'MultiStream Hub 是一個完全免費的多平台直播串流觀看工具，支援同時觀看多個 Twitch 和 YouTube 直播。提供多種布局模式、聊天室整合、音量控制和收藏功能，無需註冊即可使用。';

export const SEO_DEFAULT_IMAGE = `${SEO_SITE_URL}/icon.png`;

/** 可索引頁面的 robots meta（與 index.html 靜態值一致） */
export const SEO_ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

/** 404 / admin 等不該進索引的頁面；保留 follow 讓爬蟲仍可沿連結離開 */
export const SEO_ROBOTS_NOINDEX = 'noindex, follow';

/** /canvas 的 meta（桌機 NewCanvasPage 與手機 MobileApp 共用，避免手機版 canonical 誤指首頁） */
export const SEO_CANVAS = {
  title: '開始觀看直播 - MultiStream Hub | Multistream Viewer',
  description: '立即開始使用 MultiStream Hub。自定義您的多視窗直播布局，同時欣賞 Twitch 與 YouTube 的精彩內容。',
  url: `${SEO_SITE_URL}/canvas`,
} as const;
