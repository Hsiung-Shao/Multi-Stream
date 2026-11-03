// 無前綴網址的中文使用者 → 轉到 /zh-TW 同路徑。index.html head 內聯的是同一邏輯的壓縮版（tests 鎖字串），
// 這份給測試與日後維護對照。只讀 localStorage，不寫；Googlebot（en-US、無 localStorage）永遠回 null。

/** 沒存過偏好時，瀏覽器語言是這些才算繁中使用者（zh-CN 不算：它有自己的介面語言，住在無前綴網址） */
const ZH_TW_NAV = /^zh-(TW|Hant|HK|MO)/i;

export function rootRedirectTarget(
    pathname: string,
    search: string,
    hash: string,
    stored: string | null,
    navigatorLang: string | undefined,
): string | null {
    if (/^\/zh-TW(\/|$)/.test(pathname)) return null;
    const wantsZhTw = stored ? stored === 'zh-TW' : !!navigatorLang && ZH_TW_NAV.test(navigatorLang);
    if (!wantsZhTw) return null;
    return `/zh-TW${pathname === '/' ? '' : pathname}${search}${hash}`;
}
