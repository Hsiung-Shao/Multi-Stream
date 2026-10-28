/**
 * 缺結束時間的片段估計結束點（社群投稿與後台貼上時間軸用）。
 *
 * - 純函式、零 DOM；不修改傳入陣列，保留其他欄位與原順序。
 * - 已有 end（非 null）原樣保留，endEstimated 為 false。
 * - end 為 null：取三個候選的最小者並標 endEstimated true：
 *   下一首開始（所有列中 start 大於本列 start 的最小值，不依賴輸入順序、同 start 不算）、
 *   start + maxSeconds（預設 270 秒＝4 分 30 秒封頂，多數歌在這個長度內）、影片長度 duration（有值且大於 start 才採用）。
 * - lengthFor 有給該列歌曲長度（站內人工確認的中位數或 iTunes 原曲長度）時，第二個候選改為
 *   start + 長度 + END_ESTIMATE_BUFFER_SECONDS，不再套 maxSeconds；endSource 標 'length'，否則 'default'。
 */
export const END_ESTIMATE_MAX_SECONDS = 270;

/** 依歌曲長度估計時多留的秒數（唱完的尾奏、收尾的一兩句話） */
export const END_ESTIMATE_BUFFER_SECONDS = 10;

/** 單曲影片的長度上限：影片 ≤ 600 秒且只有一首，就是整支一首歌（目錄的 k=single 用同一條規則，見 get_song_catalog） */
export const SINGLE_SONG_MAX_SECONDS = 600;

export function isSingleSongVideo(duration: number | null | undefined, count: number): boolean {
    return typeof duration === 'number' && duration > 0 && duration <= SINGLE_SONG_MAX_SECONDS && count === 1;
}

export function estimateEnds<T extends { start: number; end: number | null }>(
    rows: T[],
    opts?: { maxSeconds?: number; duration?: number | null; lengthFor?: (row: T) => number | undefined },
): (T & { end: number; endEstimated: boolean; endSource?: 'length' | 'default' })[] {
    const maxSeconds = opts?.maxSeconds ?? END_ESTIMATE_MAX_SECONDS;
    const duration = opts?.duration ?? null;
    const starts = [...new Set(rows.map((r) => r.start))].sort((a, b) => a - b);

    return rows.map((row) => {
        if (row.end !== null) return { ...row, end: row.end, endEstimated: false };

        const length = opts?.lengthFor?.(row);
        const byLength = typeof length === 'number' && length > 0;
        let end = row.start + (byLength ? length + END_ESTIMATE_BUFFER_SECONDS : maxSeconds);
        const next = starts.find((s) => s > row.start);
        if (next !== undefined) end = Math.min(end, next);
        if (duration !== null && duration > row.start) end = Math.min(end, duration);
        return { ...row, end, endEstimated: true, endSource: byLength ? 'length' : 'default' };
    });
}
