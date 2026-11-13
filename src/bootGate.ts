/**
 * 預判 boot.tsx 會不會 hydrate 預渲染 HTML（真正判斷在 boot.tsx 的 canHydrate）。
 * 只有會 hydrate 的頁才值得等 FCP；語言或主題不符的人反正會清掉重畫，等只是讓他們更晚能操作。
 * 預判錯了也不影響正確性：只差在等不等 FCP。
 */
export const willHydratePrerender = (
    dataset: { prerenderLang?: string; prerenderTheme?: string },
    user: { theme: string | null; lng: string | null; navLang: string },
): boolean => {
    if (!dataset.prerenderLang) return false;
    if ((user.theme || 'dark') !== dataset.prerenderTheme) return false; // 對齊 useUIStore：userSettings.theme，預設 dark
    if (dataset.prerenderLang !== 'en') return true; // 繁中頁住在 /zh-TW，網址語言優先
    return /^en\b/i.test(user.lng || user.navLang); // 偵測順序同 i18n.ts：localStorage → navigator
};
