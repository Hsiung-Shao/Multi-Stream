import type { PageType } from '../store/useUIStore';
import { GUIDE_SLUGS, guidePage, guidePath, type GuidePage } from './guides';

/**
 * 頁面 ↔ URL 的單一對照表。
 * 供 useRouter（URL 同步）與 RouteLink（真實 <a href>）共用，避免兩處各自維護而漂移。
 * 教學文章頁（instructions:<slug> ↔ /instructions/<slug>）由 guides.ts 的 GUIDE_SLUGS 展開，
 * 仍是精確字串對照：pathToPage / pageToPath / edge ROUTE_META 一比一測試都不需要參數化邏輯。
 */

/** 有對應 URL 的頁面（'settings' 無路由、'not-found' 保留使用者輸入的錯誤網址） */
export type RoutePage = Exclude<PageType, 'settings' | 'not-found'>;

const GUIDE_PATHS = Object.fromEntries(
    GUIDE_SLUGS.map((s) => [guidePage(s), guidePath(s)]),
) as Record<GuidePage, string>;

export const PAGE_PATHS: Record<RoutePage, string> = {
    home: '/',
    canvas: '/canvas',
    about: '/about',
    instructions: '/instructions',
    faq: '/faq',
    support: '/support',
    privacy: '/privacy',
    admin: '/admin',
    ...GUIDE_PATHS,
};

/** 舊版靜態檔網址別名（與原 useRouter 行為完全對等，勿擴大） */
const LEGACY_HTML_ALIASES: Record<string, RoutePage> = {
    '/index.html': 'home',
    '/about.html': 'about',
    '/privacy.html': 'privacy',
};

/** URL pathname → 頁面；未知路徑回 'not-found' */
export function pathToPage(pathname: string): PageType {
    const legacy = LEGACY_HTML_ALIASES[pathname];
    if (legacy) return legacy;
    const hit = (Object.keys(PAGE_PATHS) as RoutePage[]).find((p) => PAGE_PATHS[p] === pathname);
    return hit ?? 'not-found';
}

/** 頁面 → 應同步的 URL；'not-found' 回 null 表示「不要動 URL」 */
export function pageToPath(page: PageType): string | null {
    if (page === 'not-found') return null;
    return (PAGE_PATHS as Partial<Record<PageType, string>>)[page] ?? '/';
}
