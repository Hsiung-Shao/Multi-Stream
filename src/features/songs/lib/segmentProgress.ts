/**
 * 歌曲進度條：影片絕對秒數 ↔ 片段內已播秒數。
 * 拖曳最多停在結束前 1 秒，免得一放開就被輪詢判定播完而跳下一首。
 */

const SEEK_END_MARGIN = 1;

function clamp(n: number, lo: number, hi: number): number {
    return Math.min(Math.max(n, lo), hi);
}

export function segmentProgress(t: number, start: number, end: number): { elapsed: number; total: number } {
    const total = Math.max(0, end - start);
    if (!Number.isFinite(t)) return { elapsed: 0, total };
    return { elapsed: clamp(t - start, 0, total), total };
}

export function seekTarget(start: number, end: number, elapsed: number): number {
    if (!Number.isFinite(elapsed)) return start;
    return start + clamp(elapsed, 0, Math.max(0, end - start - SEEK_END_MARGIN));
}
