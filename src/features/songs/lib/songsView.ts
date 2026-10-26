/**
 * /songs 中欄畫面 ↔ 網址 query：?v=<videoId>（單場詳細）、?view=playlists[&pl=<id>]（我的歌單）、?vtuber=<key>（列表篩選）。
 *
 * - 多個參數同時出現時優先序 v > view > vtuber；非法值一律退回不篩選的列表（網址是使用者可改的輸入）。
 * - serialize 回傳以 ? 開頭的字串，不篩選的列表回 ''；parse(serialize(x)) 與 x 深相等。
 * - ?list= 分享連結由 App 先快照並清掉，不在這裡處理。
 */
export type SongsView =
    | { kind: 'list'; vtuber: string | null }
    | { kind: 'video'; videoId: string }
    | { kind: 'playlists'; playlistId: string | null };

export const LIST_VIEW: SongsView = { kind: 'list', vtuber: null };

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_MAX = 64;
const VTUBER_KEY_MAX = 200;

export function parseSongsView(search: string): SongsView {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const v = params.get('v');
    if (v !== null && VIDEO_ID_RE.test(v)) return { kind: 'video', videoId: v };
    if (params.get('view') === 'playlists') {
        const pl = params.get('pl');
        return { kind: 'playlists', playlistId: pl && pl.length <= PLAYLIST_ID_MAX ? pl : null };
    }
    const vtuber = params.get('vtuber');
    if (vtuber && vtuber.length <= VTUBER_KEY_MAX) return { kind: 'list', vtuber };
    return { kind: 'list', vtuber: null };
}

export function serializeSongsView(view: SongsView): string {
    switch (view.kind) {
        case 'video':
            return `?v=${encodeURIComponent(view.videoId)}`;
        case 'playlists':
            return view.playlistId ? `?view=playlists&pl=${encodeURIComponent(view.playlistId)}` : '?view=playlists';
        case 'list':
            return view.vtuber ? `?vtuber=${encodeURIComponent(view.vtuber)}` : '';
    }
}

/** 兩個畫面是否相同（切換時同值不 pushState） */
export const sameSongsView = (a: SongsView, b: SongsView): boolean => serializeSongsView(a) === serializeSongsView(b);
