/**
 * 缺結束時間的片段估計結束點（社群投稿與後台貼上時間軸用）。
 *
 * - 純函式、零 DOM；不修改傳入陣列，保留其他欄位與原順序。
 * - 已有 end（非 null）原樣保留，endEstimated 為 false。
 * - end 為 null：取三個候選的最小者並標 endEstimated true：
 *   下一首開始（所有列中 start 大於本列 start 的最小值，不依賴輸入順序、同 start 不算）、
 *   start + maxSeconds（預設 360 秒封頂）、影片長度 duration（有值且大於 start 才採用）。
 */
export const END_ESTIMATE_MAX_SECONDS = 360;

export function estimateEnds<T extends { start: number; end: number | null }>(
    rows: T[],
    opts?: { maxSeconds?: number; duration?: number | null },
): (T & { end: number; endEstimated: boolean })[] {
    const maxSeconds = opts?.maxSeconds ?? END_ESTIMATE_MAX_SECONDS;
    const duration = opts?.duration ?? null;
    const starts = [...new Set(rows.map((r) => r.start))].sort((a, b) => a - b);

    return rows.map((row) => {
        if (row.end !== null) return { ...row, end: row.end, endEstimated: false };

        let end = row.start + maxSeconds;
        const next = starts.find((s) => s > row.start);
        if (next !== undefined) end = Math.min(end, next);
        if (duration !== null && duration > row.start) end = Math.min(end, duration);
        return { ...row, end, endEstimated: true };
    });
}
