/**
 * 播放器切歌判斷：片段播放靠輪詢 currentTime 到結束點才切下一首，這裡放兩個純判斷。
 *
 * - shouldAdvance：到達結束點前 END_EPSILON 秒就視為結束（輪詢有間隔，等剛好到會漏掉）。
 * - planLoad：下一首與上一首是同一支影片時只 seek（不重新載入，避免閃爍與重新緩衝），否則 load。
 */
import type { QueueItem } from './queue';

/** 提前判定結束的容差（秒） */
export const END_EPSILON = 0.25;

export function shouldAdvance(currentTime: number, end: number): boolean {
    return currentTime >= end - END_EPSILON;
}

export function planLoad(prev: QueueItem | null, next: QueueItem): 'seek' | 'load' {
    return prev !== null && prev.videoId === next.videoId ? 'seek' : 'load';
}
