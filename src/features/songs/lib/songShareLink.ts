/**
 * 歌單分享連結：?list=<code>.<code>...（code 為歌曲片段的 8 碼短碼）
 *
 * - 純函式、零 DOM：序列化/解析都在這裡，分享按鈕與啟動消費共用（風格同 utils/shareLink.ts）。
 * - code 只允許 [0-9a-z]{8}；大寫、符號、長度不對一律丟棄，其餘 code 不受影響。
 * - 去重保序，最多 SONG_SHARE_MAX 筆；以 '.' 連接（'.' 在 query string 不必 encode）。
 */
export const SONG_SHARE_PARAM = 'list';
export const SONG_SHARE_MAX = 100;

const CODE_RE = /^[0-9a-z]{8}$/;

function sanitize(codes: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const code of codes) {
        if (out.length >= SONG_SHARE_MAX) break;
        if (!CODE_RE.test(code) || seen.has(code)) continue;
        seen.add(code);
        out.push(code);
    }
    return out;
}

/** 組出分享參數的值（不含 `list=`）；無合法 code 回 '' */
export function serializeSongShare(codes: string[]): string {
    return sanitize(codes).join('.');
}

/** 解析分享參數的值；空值或全部非法回 [] */
export function parseSongShare(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return sanitize(raw.split('.'));
}
