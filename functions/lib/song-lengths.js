// 歌曲長度查詢（/api/songs/lengths）的純函式：請求驗證、iTunes Search 網址、iTunes 結果配對。
//
// - 只用來估計時間軸「沒寫結束」的列；配錯的代價是估計不準，所以寧可不配也不要配錯：
//   沒有原唱就不配；歌名要包含在曲名裡、原唱與 artistName 至少一邊包含另一邊；
//   live／remix／inst／karaoke／伴奏 版本排除（歌名本身就有該字時例外）；長度 60～900 秒才收。
// - 正規化只供這裡比對（NFKC、小寫、去空白標點）；資料庫的比對鍵仍以 song_norm_text 為準。

export const LENGTHS_ITEMS_MAX = 60;
export const ITUNES_COUNTRIES = ['TW', 'JP', 'US'];

const TEXT_MAX = 200;
const SECONDS_MIN = 60;
const SECONDS_MAX = 900;
const VERSION_WORDS = [/\blive\b/i, /\bremix\b/i, /\binst(?:rumental)?\b/i, /\bkaraoke\b/i, /伴奏/];

const bad = () => ({ ok: false, error: 'invalid_payload' });

/** NFKC、小寫，去掉空白與標點（Unicode P／S 類） */
function norm(s) {
    return String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

/**
 * @param {unknown} body { items: [{ title, artist? }] }
 * @returns {{ ok: true, items: { title: string, artist: string|null }[] } | { ok: false, error: 'invalid_payload' }}
 */
export function parseLengthsBody(body) {
    if (!body || typeof body !== 'object' || !Array.isArray(body.items)) return bad();
    const { items } = body;
    if (items.length < 1 || items.length > LENGTHS_ITEMS_MAX) return bad();
    const out = [];
    for (const it of items) {
        if (!it || typeof it !== 'object' || typeof it.title !== 'string') return bad();
        const title = it.title.trim();
        if (!title || title.length > TEXT_MAX) return bad();
        let artist = null;
        if (it.artist !== undefined && it.artist !== null) {
            if (typeof it.artist !== 'string') return bad();
            artist = it.artist.trim() || null;
            if (artist && artist.length > TEXT_MAX) return bad();
        }
        out.push({ title, artist });
    }
    return { ok: true, items: out };
}

export function itunesUrl(title, artist, country) {
    const params = new URLSearchParams({
        entity: 'song',
        limit: '10',
        country,
        term: [title, artist].filter(Boolean).join(' '),
    });
    return `https://itunes.apple.com/search?${params}`;
}

/**
 * @param {{ trackName?: string, artistName?: string, trackTimeMillis?: number }[]} results iTunes 的 results
 * @returns {{ seconds: number, matched: string } | null}
 */
export function pickItunesMatch(results, title, artist) {
    if (!artist || !Array.isArray(results)) return null;
    const t = norm(title);
    const a = norm(artist);
    if (!t || !a) return null;
    for (const r of results) {
        const track = String(r?.trackName ?? '');
        const name = norm(r?.artistName);
        if (!norm(track).includes(t)) continue;
        if (!name || !(name.includes(a) || a.includes(name))) continue;
        if (VERSION_WORDS.some((re) => re.test(track) && !re.test(title))) continue;
        const seconds = Math.round(Number(r?.trackTimeMillis) / 1000);
        if (!Number.isFinite(seconds) || seconds < SECONDS_MIN || seconds > SECONDS_MAX) continue;
        return { seconds, matched: `${track} / ${r.artistName}` };
    }
    return null;
}
