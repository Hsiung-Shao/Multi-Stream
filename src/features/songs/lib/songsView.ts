/**
 * /songs 中欄畫面 ↔ 網址 query：
 * ?v=<videoId>（單場詳細）、?song=<id>[&from=<VTuber 鍵>]（單曲頁）、?view=playlists[&pl=<id>]（我的歌單）、
 * ?vtuber=<鍵>[&tab=videos]（VTuber 個人頁，預設「歌單」分頁）。
 *
 * - 多個參數同時出現時優先序 v > song > view > vtuber；非法值一律退回列表（網址是使用者可改的輸入）。
 * - serialize 回傳以 ? 開頭的字串，列表回 ''；parse(serialize(x)) 與 x 深相等。
 * - ?list= 分享連結由 App 先快照並清掉，不在這裡處理。
 */
export type VtuberTab = 'songs' | 'videos';

export type SongsView =
    | { kind: 'list' }
    | { kind: 'vtuber'; vtuber: string; tab: VtuberTab }
    | { kind: 'song'; songId: number; from: string | null }
    | { kind: 'video'; videoId: string }
    | { kind: 'playlists'; playlistId: string | null };

/** 瀏覽型畫面：列表、個人頁、單曲頁。返回鍵、捲動快照與「顯示更多」筆數都以它們為單位 */
export type BrowseView = Extract<SongsView, { kind: 'list' | 'vtuber' | 'song' }>;

export const LIST_VIEW: BrowseView = { kind: 'list' };

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
/** 歌曲 id：正整數、最多 16 位（再大就超出 JS 安全整數範圍的量級） */
const SONG_ID_RE = /^[1-9]\d{0,15}$/;
const PLAYLIST_ID_MAX = 64;
const VTUBER_KEY_MAX = 200;

export const isBrowseView = (view: SongsView): view is BrowseView =>
    view.kind === 'list' || view.kind === 'vtuber' || view.kind === 'song';

const vtuberKeyOf = (value: string | null): string | null => (value && value.length <= VTUBER_KEY_MAX ? value : null);

export function parseSongsView(search: string): SongsView {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const v = params.get('v');
    if (v !== null && VIDEO_ID_RE.test(v)) return { kind: 'video', videoId: v };
    const song = params.get('song');
    if (song !== null && SONG_ID_RE.test(song)) {
        const songId = Number(song);
        if (Number.isSafeInteger(songId)) return { kind: 'song', songId, from: vtuberKeyOf(params.get('from')) };
    }
    if (params.get('view') === 'playlists') {
        const pl = params.get('pl');
        return { kind: 'playlists', playlistId: pl && pl.length <= PLAYLIST_ID_MAX ? pl : null };
    }
    const vtuber = vtuberKeyOf(params.get('vtuber'));
    if (vtuber) return { kind: 'vtuber', vtuber, tab: params.get('tab') === 'videos' ? 'videos' : 'songs' };
    return LIST_VIEW;
}

export function serializeSongsView(view: SongsView): string {
    switch (view.kind) {
        case 'video':
            return `?v=${encodeURIComponent(view.videoId)}`;
        case 'song':
            return `?song=${view.songId}${view.from ? `&from=${encodeURIComponent(view.from)}` : ''}`;
        case 'playlists':
            return view.playlistId ? `?view=playlists&pl=${encodeURIComponent(view.playlistId)}` : '?view=playlists';
        case 'vtuber':
            return `?vtuber=${encodeURIComponent(view.vtuber)}${view.tab === 'videos' ? '&tab=videos' : ''}`;
        case 'list':
            return '';
    }
}

/** 兩個畫面是否相同（切換時同值不 pushState） */
export const sameSongsView = (a: SongsView, b: SongsView): boolean => serializeSongsView(a) === serializeSongsView(b);
