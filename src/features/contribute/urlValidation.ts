// 前端網址檢查（投稿、回報共用）：解析方式同後端 normalizeHttpUrl（functions/lib/vtuber-submit.js），
// 另外要求網域含「.」，擋掉打錯的單字（後端仍會再檢查一次）。
// 獨立成小檔，回報對話框不必為此載入整個投稿表單。

/** 可省略 https://，只收 http(s)、要有網域、最長 2048 */
export function isHttpUrl(raw: string): boolean {
    const s = raw.trim();
    if (!s || s.length > 2048) return false;
    try {
        const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
        return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
    } catch {
        return false;
    }
}
