import type { PageType } from '../store/useUIStore';
import { GUIDE_SLUGS, guidePage, guidePath, type GuidePage } from './guides';
import { isSchedulePersonPage, schedulePersonFromPath, schedulePersonPath, schedulePersonSlugOf, type SchedulePersonPage } from './schedulePerson';
import { splitLangPath, withLang, type UrlLang } from '../../functions/lib/locale.js';

/**
 * 頁面 ↔ URL 的單一對照表。
 * 供 useRouter（URL 同步）與 RouteLink（真實 <a href>）共用，避免兩處各自維護而漂移。
 * 教學文章頁（instructions:<slug> ↔ /instructions/<slug>）由 guides.ts 的 GUIDE_SLUGS 展開，
 * 仍是精確字串對照：pathToPage / pageToPath / edge ROUTE_META 一比一測試都不需要參數化邏輯。
 */

/**
 * 有固定 URL 的頁面（'settings' 無路由、'not-found' 保留使用者輸入的錯誤網址）。
 * 個人週表頁 schedule:<slug> 的 slug 是資料庫任意值，不在這張表裡（見 schedulePerson.ts）。
 */
export type RoutePage = Exclude<PageType, 'settings' | 'not-found' | SchedulePersonPage>;

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
    creator: '/about/creator',
    compare: '/compare',
    schedule: '/schedule',
    // 新增 VTuber：比個人頁 /schedule/<slug> 先比對（PAGE_PATHS 精確比對在前；資料庫也把 submit 列為 slug 保留字）
    scheduleSubmit: '/schedule/submit',
    status: '/status',
    songs: '/songs',
    // 投稿歌回時間軸（精確比對，與 /songs 不衝突）
    songsSubmit: '/songs/submit',
    ...GUIDE_PATHS,
};

/** 舊版靜態檔網址別名（與原 useRouter 行為完全對等，勿擴大） */
const LEGACY_HTML_ALIASES: Record<string, RoutePage> = {
    '/index.html': 'home',
    '/about.html': 'about',
    '/privacy.html': 'privacy',
};

/** URL pathname → 頁面；看穿語言前綴（/zh-TW/about → about）；未知路徑回 'not-found' */
export function pathToPage(pathname: string): PageType {
    const { path } = splitLangPath(pathname);
    const legacy = LEGACY_HTML_ALIASES[path];
    if (legacy) return legacy;
    const hit = (Object.keys(PAGE_PATHS) as RoutePage[]).find((p) => PAGE_PATHS[p] === path);
    return hit ?? schedulePersonFromPath(path) ?? 'not-found';
}

/** URL pathname 帶的語言前綴；沒有（英文或其他介面語言）回 null */
export function langFromPath(pathname: string): 'zh-TW' | null {
    return splitLangPath(pathname).lang;
}

/** 頁面 → 應同步的 URL（依語言加前綴，見 functions/lib/locale.js）；'not-found' 回 null 表示「不要動 URL」 */
export function pageToPath(page: PageType, urlLang: UrlLang = 'en'): string | null {
    if (page === 'not-found') return null;
    const path = isSchedulePersonPage(page)
        ? schedulePersonPath(schedulePersonSlugOf(page))
        : (PAGE_PATHS as Partial<Record<PageType, string>>)[page] ?? '/';
    return withLang(urlLang, path);
}
