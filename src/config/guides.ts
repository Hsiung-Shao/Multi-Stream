/**
 * 教學文章（/instructions/<slug>）的單一來源：slug 清單、page 型別與 schema 用靜態中繼資料。
 * 純 TS、零 import：routes.ts / useUIStore / vite.config / 測試都會載入。
 *
 * 新增一篇文章的接線：GUIDE_SLUGS + GUIDE_META（本檔）→ InstructionsPage articles →
 * locales/*\/seo.ts `instructions.<slug>.*` → functions/lib/seo-meta.js ROUTE_META（parity 測試會擋）
 * → scripts/generate-sitemap.js → public/llms.txt。
 */
export const GUIDE_SLUGS = [
    'quick-start',
    'canvas',
    'search',
    'dynamic-island',
    'favorites',
    'media',
    'settings',
    'share',
    'shortcuts',
] as const;

export type GuideSlug = typeof GUIDE_SLUGS[number];

/** page 值把 slug 內嵌在字串裡：pageToPath/useRouter/RouteLink 不需要另外傳參數 */
export type GuidePage = `instructions:${GuideSlug}`;

const GUIDE_PAGE_PREFIX = 'instructions:';

export const guidePage = (slug: GuideSlug): GuidePage => `${GUIDE_PAGE_PREFIX}${slug}`;

export const isGuideSlug = (s: string): s is GuideSlug => (GUIDE_SLUGS as readonly string[]).includes(s);

export const isGuidePage = (page: string): page is GuidePage =>
    page.startsWith(GUIDE_PAGE_PREFIX) && isGuideSlug(page.slice(GUIDE_PAGE_PREFIX.length));

export const guideSlugOf = (page: GuidePage): GuideSlug => page.slice(GUIDE_PAGE_PREFIX.length) as GuideSlug;

export const guidePath = (slug: GuideSlug): string => `/instructions/${slug}`;

/**
 * 文章靜態中繼資料（不含文案；文案在 tutorial / seo namespace）。
 * - datePublished：部落格式文章 URL 形態誕生於 2026-06-08（49ec9baa），7 篇內容當時已存在；
 *   手寫常數、上線後不漂移。dateModified 由 build 時 git lastmod 注入（vite.config）。
 * - image：該篇第一張截圖（/docs/tutorial/*.webp，1403×994），供 TechArticle.image / og:image。
 */
export const GUIDE_META: Record<GuideSlug, { category: 'basics' | 'advanced'; datePublished: string; image: string }> = {
    'quick-start': { category: 'basics', datePublished: '2026-06-08', image: '/docs/tutorial/island-search-bar.webp' },
    'canvas': { category: 'basics', datePublished: '2026-06-08', image: '/docs/tutorial/island-add-window.webp' },
    'search': { category: 'basics', datePublished: '2026-06-08', image: '/docs/tutorial/island-search-bar.webp' },
    'dynamic-island': { category: 'advanced', datePublished: '2026-06-08', image: '/docs/tutorial/island-fullscreen.webp' },
    'favorites': { category: 'advanced', datePublished: '2026-06-08', image: '/docs/tutorial/island-favorites-list.webp' },
    'media': { category: 'advanced', datePublished: '2026-06-08', image: '/docs/tutorial/island-media-control.webp' },
    'settings': { category: 'advanced', datePublished: '2026-06-08', image: '/docs/tutorial/island-settings.webp' },
    // 2026-08-27 新增。image 先借用既有截圖，待補拍後換掉（清單見 TODO-tutorial-screenshots.md）
    'share': { category: 'advanced', datePublished: '2026-08-27', image: '/docs/tutorial/island-home.webp' },
    'shortcuts': { category: 'advanced', datePublished: '2026-08-27', image: '/docs/tutorial/island-fullscreen.webp' },
};
