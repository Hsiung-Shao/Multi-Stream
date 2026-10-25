/**
 * 歌曲目錄的查詢索引：週表卡片（歌回徽章）與 VTuber 頁（歌回列表）共用。
 *
 * - 純函式、零 DOM；不修改傳入的 videos。
 * - buildVideoIndex：videoId → { 影片標題, 全部片段 code }，code 順序同 segments（不重新排序）。
 * - songsForVtuber：只回該 VTuber 的歌回（vtuber 為 null 不納入），streamedAt 新到舊，
 *   null 排最後；同時間或同為 null 保持原順序（Array.sort 為穩定排序）。
 */
import type { SongVideo } from '../songsSource';

export function buildVideoIndex(videos: SongVideo[]): Map<string, { title: string; codes: string[] }> {
    const index = new Map<string, { title: string; codes: string[] }>();
    for (const video of videos) {
        index.set(video.videoId, { title: video.title, codes: video.segments.map((s) => s.code) });
    }
    return index;
}

function timeOf(streamedAt: string | null): number | null {
    if (!streamedAt) return null;
    const t = Date.parse(streamedAt);
    return Number.isNaN(t) ? null : t;
}

export function songsForVtuber(videos: SongVideo[], vtuberId: string): SongVideo[] {
    return videos
        .filter((v) => v.vtuber?.id === vtuberId)
        .sort((a, b) => {
            const ta = timeOf(a.streamedAt);
            const tb = timeOf(b.streamedAt);
            if (ta === null && tb === null) return 0;
            if (ta === null) return 1;
            if (tb === null) return -1;
            return tb - ta;
        });
}
