// 個人週表頁 /schedule/<slug> 的路由。
//
// 與教學文章（instructions:<slug>，slug 是寫死的有限清單）不同，這裡的 slug 是資料庫裡的任意值（約 2,900 位），
// 所以**不**展開進 PAGE_PATHS：pathToPage／pageToPath 另外做前綴解析；edge（functions/[[path]].js）與
// 動態 sitemap（functions/sitemap-schedule.xml.js）各自處理，不影響 seoEdge／prerender／sitemap 的一比一測試。
// slug 規則與資料庫 CHECK（vtubers_slug_format）一致。

export const SCHEDULE_PERSON_PREFIX = 'schedule:';
export const SCHEDULE_SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;

export type SchedulePersonPage = `schedule:${string}`;

export function isSchedulePersonPage(page: string): page is SchedulePersonPage {
    return page.startsWith(SCHEDULE_PERSON_PREFIX) && SCHEDULE_SLUG_RE.test(page.slice(SCHEDULE_PERSON_PREFIX.length));
}

export function schedulePersonPage(slug: string): SchedulePersonPage {
    return `${SCHEDULE_PERSON_PREFIX}${slug}` as SchedulePersonPage;
}

export function schedulePersonSlugOf(page: SchedulePersonPage): string {
    return page.slice(SCHEDULE_PERSON_PREFIX.length);
}

export function schedulePersonPath(slug: string): string {
    return `/schedule/${slug}`;
}

/** /schedule/<slug> → 頁面；不是個人頁網址回 null */
export function schedulePersonFromPath(pathname: string): SchedulePersonPage | null {
    const m = /^\/schedule\/([^/]+)$/.exec(pathname);
    if (!m) return null;
    // 壞掉的百分比編碼（/schedule/%E0%A4%A）會讓 decodeURIComponent 丟 URIError；
    // 這裡在 store 初始化時就會被呼叫，丟出去會整頁白屏，所以當成不是個人頁（最後落到 404 頁）
    let slug: string;
    try {
        slug = decodeURIComponent(m[1]).toLowerCase();
    } catch {
        return null;
    }
    return SCHEDULE_SLUG_RE.test(slug) ? schedulePersonPage(slug) : null;
}
