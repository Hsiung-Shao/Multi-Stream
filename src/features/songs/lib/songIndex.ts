/**
 * 歌曲索引（v1.3）：songId → 各版本、VTuber 完整歌單、單曲頁的版本分組。
 *
 * - 純函式、零 DOM；不修改傳入的 videos。
 * - 版本（SongEntry）＝一個帶 songId 的片段與其所屬歌回；songId 為 null 的片段不收。
 * - 版本排序：開台時間新到舊、沒有時間的排最後；同一場內依 start 由小到大；
 *   同時間的不同場維持輸入順序（用輸入位置當排序鍵，避免比較不具遞移性）。
 * - VTuber 鍵沿用 catalogView.vtuberKey；沒有 VTuber 的版本不進 songsOfVtuber，在 versionsOfSong 以 key null 墊底。
 */
import type { SongEntry, SongInfo, SongVideo, SongVtuber } from '../songsSource';
import { vtuberKey } from './catalogView';

export interface SongIndex {
    /** 字典歌曲原樣保留（含沒有任何版本的歌） */
    songs: Map<number, SongInfo>;
    /** songId → 版本清單（已排序）；沒有任何版本的歌不在這裡 */
    versions: Map<number, SongEntry[]>;
}

export type SongListSort = 'latest' | 'count';

/** VTuber 歌單的一列 */
export interface VtuberSongRow {
    song: SongInfo;
    /** 這位 VTuber 唱過的版本（新到舊） */
    versions: SongEntry[];
    /** 最新一場的開台時間毫秒值；都沒有時間時 null */
    latestAt: number | null;
    /** 各版本播放次數加總 */
    plays: number;
}

/** 單曲頁的版本分組（一位 VTuber 一組；沒有 VTuber 的版本合成 key 為 null 的一組） */
export interface SongVersionGroup {
    key: string | null;
    vtuber: SongVtuber | null;
    /** 新到舊 */
    versions: SongEntry[];
}

function timeOf(streamedAt: string | null): number | null {
    if (!streamedAt) return null;
    const t = Date.parse(streamedAt);
    return Number.isNaN(t) ? null : t;
}

/** 新到舊、null 最後；相同回 0 */
function compareDesc(a: number | null, b: number | null): number {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
}

export function buildSongIndex(videos: SongVideo[], dict: Map<number, SongInfo>): SongIndex {
    const keyed = new Map<number, { entry: SongEntry; at: number | null; order: number }[]>();
    videos.forEach((video, order) => {
        const at = timeOf(video.streamedAt);
        for (const segment of video.segments) {
            if (segment.songId == null) continue;
            const list = keyed.get(segment.songId);
            const item = { entry: { segment, video }, at, order };
            if (list) list.push(item);
            else keyed.set(segment.songId, [item]);
        }
    });
    const versions = new Map<number, SongEntry[]>();
    for (const [songId, list] of keyed) {
        list.sort((a, b) => compareDesc(a.at, b.at) || a.order - b.order || a.entry.segment.start - b.entry.segment.start);
        versions.set(songId, list.map((x) => x.entry));
    }
    return { songs: dict, versions };
}

const latestOf = (versions: SongEntry[]): number | null => {
    let latest: number | null = null;
    for (const v of versions) {
        const t = timeOf(v.video.streamedAt);
        if (t !== null && (latest === null || t > latest)) latest = t;
    }
    return latest;
};

/** 某位 VTuber 的完整歌單。latest：最新一場新到舊；count：版本數多到少；同分依 latestAt 再依歌名 */
export function songsOfVtuber(index: SongIndex, key: string, sort: SongListSort): VtuberSongRow[] {
    const rows: VtuberSongRow[] = [];
    for (const [songId, all] of index.versions) {
        const song = index.songs.get(songId);
        if (!song) continue;
        const versions = all.filter((e) => !!e.video.vtuber && vtuberKey(e.video.vtuber) === key);
        if (versions.length === 0) continue;
        rows.push({
            song,
            versions,
            latestAt: latestOf(versions),
            plays: versions.reduce((sum, e) => sum + e.segment.plays, 0),
        });
    }
    return rows.sort((a, b) => {
        const byCount = sort === 'count' ? b.versions.length - a.versions.length : 0;
        return byCount || compareDesc(a.latestAt, b.latestAt) || a.song.title.localeCompare(b.song.title);
    });
}

/**
 * 單曲頁：這首歌的版本依 VTuber 分組。組間順序：版本數多到少 → 最新一場新到舊 → VTuber 名稱；
 * 沒有 VTuber 的組墊底；fromKey 那位（若有版本）排第一，未知的 fromKey 直接忽略。
 */
export function versionsOfSong(index: SongIndex, songId: number, fromKey: string | null): SongVersionGroup[] {
    const all = index.versions.get(songId);
    if (!all) return [];
    const byKey = new Map<string | null, SongVersionGroup>();
    for (const entry of all) {
        const vtuber = entry.video.vtuber;
        const key = vtuber ? vtuberKey(vtuber) : null;
        const group = byKey.get(key);
        if (group) group.versions.push(entry);
        else byKey.set(key, { key, vtuber, versions: [entry] });
    }
    const rank = (g: SongVersionGroup) => (g.key === null ? 2 : g.key === fromKey ? 0 : 1);
    return [...byKey.values()].sort((a, b) => {
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return (
            b.versions.length - a.versions.length ||
            compareDesc(latestOf(a.versions), latestOf(b.versions)) ||
            (a.vtuber?.name ?? '').localeCompare(b.vtuber?.name ?? '')
        );
    });
}

export function flattenVersions(groups: SongVersionGroup[]): SongEntry[] {
    return groups.flatMap((g) => g.versions);
}
