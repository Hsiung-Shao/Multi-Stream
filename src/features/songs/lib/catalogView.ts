/**
 * 歌回目錄檢視：排序、搜尋（自 SongsPage 搬出）與左欄 VTuber 清單推導、篩選。
 *
 * - 純函式、零 DOM：不修改輸入，一律回傳新陣列（filterByVtuber 在 key 為 null 時原樣回傳）。
 * - latest 依開台時間新到舊、沒有時間的排最後，與伺服器 RPC 的 `streamed_at desc nulls last` 同序；
 *   同值維持原順序，所以對伺服器順序的資料是原樣。
 */
import type { SongVideo, SongVtuber } from '../songsSource';

export type CatalogSort = 'latest' | 'popular';

export const videoPlays = (video: SongVideo): number => video.segments.reduce((sum, s) => sum + s.plays, 0);

/** 開台時間毫秒值；沒有或無法解析時 null */
const streamedMs = (video: SongVideo): number | null => {
    if (!video.streamedAt) return null;
    const ms = Date.parse(video.streamedAt);
    return Number.isNaN(ms) ? null : ms;
};

/** 目錄排序：latest 依開台時間新到舊（null 最後）；popular 依整支歌回總播放次數多到少。同分都維持原順序 */
export function sortCatalog(videos: SongVideo[], sort: CatalogSort): SongVideo[] {
    const keyed = videos.map((video, i) => ({ video, i, key: sort === 'popular' ? videoPlays(video) : streamedMs(video) }));
    keyed.sort((a, b) => {
        if (a.key === b.key) return a.i - b.i;
        if (a.key === null) return 1;
        if (b.key === null) return -1;
        return b.key - a.key;
    });
    return keyed.map((x) => x.video);
}

const normalize = (s: string) => s.normalize('NFKC').toLowerCase();

/** client 端搜尋：VTuber 名稱或歌回標題命中 → 整支歌回；否則只留歌名／原唱命中的歌 */
export function filterCatalog(videos: SongVideo[], query: string): SongVideo[] {
    const q = normalize(query.trim());
    if (!q) return videos;
    const out: SongVideo[] = [];
    for (const video of videos) {
        if (normalize(video.vtuber?.name ?? '').includes(q) || normalize(video.title).includes(q)) {
            out.push(video);
            continue;
        }
        const segments = video.segments.filter(
            (s) => normalize(s.title).includes(q) || normalize(s.artist ?? '').includes(q),
        );
        if (segments.length > 0) out.push({ ...video, segments });
    }
    return out;
}

export interface VtuberSummary {
    key: string;
    id: string;
    name: string;
    img: string | null;
    /** 歌回場數 */
    videoCount: number;
    /** 歌曲首數（片段數加總） */
    songCount: number;
    /** 最新一場的開台時間毫秒值；都沒有時間時 null */
    latestAt: number | null;
}

/** VTuber 識別鍵：有 id 用 id，沒有（目錄未連結 VTuber 主表）用名稱 */
export const vtuberKey = (v: SongVtuber): string => (v.id ? v.id : `name:${v.name}`);

/** 左欄 VTuber 清單：同一個 key 合併，依最新開台時間新到舊（null 最後、同值依名稱） */
export function deriveVtubers(videos: SongVideo[]): VtuberSummary[] {
    const byKey = new Map<string, VtuberSummary>();
    for (const video of videos) {
        const v = video.vtuber;
        if (!v) continue;
        const key = vtuberKey(v);
        const at = streamedMs(video);
        const cur = byKey.get(key);
        if (!cur) {
            byKey.set(key, { key, id: v.id, name: v.name, img: v.img, videoCount: 1, songCount: video.segments.length, latestAt: at });
            continue;
        }
        cur.videoCount += 1;
        cur.songCount += video.segments.length;
        if (at !== null && (cur.latestAt === null || at > cur.latestAt)) cur.latestAt = at;
        if (!cur.img && v.img) cur.img = v.img;
    }
    return [...byKey.values()].sort((a, b) => {
        if (a.latestAt !== b.latestAt) {
            if (a.latestAt === null) return 1;
            if (b.latestAt === null) return -1;
            return b.latestAt - a.latestAt;
        }
        return a.name.localeCompare(b.name);
    });
}

/** 依 VTuber 篩選；key 為 null 時原樣回傳，否則保持原順序 */
export function filterByVtuber(videos: SongVideo[], key: string | null): SongVideo[] {
    if (key === null) return videos;
    return videos.filter((video) => !!video.vtuber && vtuberKey(video.vtuber) === key);
}
