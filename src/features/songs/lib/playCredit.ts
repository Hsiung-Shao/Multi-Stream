/**
 * 播放次數計次規則：聆聽夠久才算一次，避免點進來就算。
 *
 * - 純函式、零 DOM；由 useSegmentPlayer 的 250ms 輪詢呼叫 accumulate 累計聆聽秒數。
 * - 門檻 = 30 秒與片段一半長度的較小者（短片段不會永遠達不到）。
 * - accumulate 每次最多加 MAX_TICK_SECONDS：分頁被凍結後的長間隔不會一次灌滿門檻。
 * - dedupeRecent：同一個 code 30 分鐘內只計一次（含重新整理後），剛好滿視窗視為已過期。
 */
export const PLAY_THRESHOLD_MAX_SECONDS = 30;
export const MAX_TICK_SECONDS = 1.5;
export const DEDUPE_WINDOW_MS = 30 * 60_000;

export function playThreshold(start: number, end: number): number {
    return Math.min(PLAY_THRESHOLD_MAX_SECONDS, (end - start) / 2);
}

export function accumulate(listenedSeconds: number, deltaMs: number, playing: boolean): number {
    if (!playing || deltaMs <= 0) return listenedSeconds;
    return listenedSeconds + Math.min(deltaMs / 1000, MAX_TICK_SECONDS);
}

/** 濾掉視窗內已計過的 code；結果去重保序，不修改 seen */
export function dedupeRecent(
    codes: string[],
    seen: Record<string, number>,
    now: number,
    windowMs: number = DEDUPE_WINDOW_MS,
): string[] {
    const out = new Set<string>();
    for (const code of codes) {
        const at = seen[code];
        if (typeof at === 'number' && now - at < windowMs) continue;
        out.add(code);
    }
    return [...out];
}
