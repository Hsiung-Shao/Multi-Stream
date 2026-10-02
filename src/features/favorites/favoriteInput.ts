// 新增收藏輸入框的解析:平台偵測 + 只輸入名稱時依使用者選的平台組出完整網址。
// 真正的平台判定仍在 favoritesService.addFavorite(看網址含 twitch.tv / youtube.com),
// 所以只輸入名稱時必須先在這裡補成完整網址,否則會被存成 platform 'other'、開台偵測略過。

export type FavoriteInputPlatform = 'twitch' | 'youtube';

export function detectFavoritePlatform(input: string): { platform: FavoriteInputPlatform | null; handle: string } {
    const s = (input || '').trim();
    if (!s) return { platform: null, handle: '' };
    let m: RegExpMatchArray | null;
    if ((m = s.match(/twitch\.tv\/([A-Za-z0-9_]{2,40})/i))) return { platform: 'twitch', handle: m[1] };
    if ((m = s.match(/youtube\.com\/@([A-Za-z0-9_.\-]{2,40})/i))) return { platform: 'youtube', handle: m[1] };
    if ((m = s.match(/youtube\.com\/channel\/([A-Za-z0-9_\-]{4,40})/i))) return { platform: 'youtube', handle: m[1] };
    if ((m = s.match(/youtu\.be\/([A-Za-z0-9_\-]{4,40})/i))) return { platform: 'youtube', handle: m[1] };
    if (/^@?[A-Za-z0-9_.\-]{2,40}$/.test(s)) return { platform: null, handle: s.replace(/^@/, '') };
    return { platform: null, handle: '' };
}

/** 輸入只有名稱(看不出平台),需要使用者選平台 */
export function needsPlatformChoice(input: string): boolean {
    const det = detectFavoritePlatform(input);
    return !!det.handle && !det.platform;
}

/**
 * 回傳實際要交給 addFavorite 的網址。
 * 只輸入名稱且已選平台 → 組成 twitch.tv/<name> 或 youtube.com/@<name>;其他情況原樣(trim)回傳。
 */
export function buildFavoriteUrl(input: string, chosenPlatform: FavoriteInputPlatform | null): string {
    const s = (input || '').trim();
    if (!chosenPlatform || !needsPlatformChoice(s)) return s;
    const handle = s.replace(/^@/, '');
    return chosenPlatform === 'twitch'
        ? `https://www.twitch.tv/${handle.toLowerCase()}`
        : `https://www.youtube.com/@${handle}`;
}
