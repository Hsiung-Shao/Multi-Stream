// 歌曲播放次數：請求 body 驗證（與 song_segments.code 的 CHECK 同一規則）

export const SONG_PLAYS_MAX = 20;
const CODE_RE = /^[0-9a-z]{8}$/;

/**
 * 驗證並整理 body：codes 為非空陣列、每個符合短 ID 格式、去重（保序）後不超過 SONG_PLAYS_MAX
 * @param {any} body
 * @returns {{ ok: true, codes: string[] } | { ok: false, error: 'invalid_payload' }}
 */
export function parsePlaysBody(body) {
    const bad = { ok: false, error: 'invalid_payload' };
    if (!body || typeof body !== 'object' || Array.isArray(body)) return bad;
    const { codes } = body;
    // 先擋過長陣列再逐筆檢查,避免惡意大陣列白做工(body 本身另有 2KB 上限)
    if (!Array.isArray(codes) || codes.length === 0 || codes.length > SONG_PLAYS_MAX * 4) return bad;
    for (const c of codes) {
        if (typeof c !== 'string' || !CODE_RE.test(c)) return bad;
    }
    const unique = [...new Set(codes)];
    if (unique.length > SONG_PLAYS_MAX) return bad;
    return { ok: true, codes: unique };
}
