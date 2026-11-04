// 「接下來」的時段分帶（設計稿 /schedule A，2026-11-04）：全站實況主一起列時逐小時一排排會拉很長，
// 改成固定幾個時段，每段一排頭像小格（DayBands.tsx）。小時依觀眾裝置時區。

export type Band = 'now' | 'morning' | 'afternoon' | 'evening' | 'night';

export const BAND_ORDER: readonly Band[] = ['now', 'morning', 'afternoon', 'evening', 'night'];
/** 「進行中／即將」：開始時間在 [now − 15 分鐘, 下一整點] 之內（剛開台的＋這個整點前要開的；13:50 看到 14:00 算即將） */
export const NOW_GRACE_MS = 15 * 60_000;

function nextFullHour(now: number): number {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    return d.getTime() + 3_600_000;
}

export function bandOf(startMs: number, now: number): Band {
    if (startMs >= now - NOW_GRACE_MS && startMs <= nextFullHour(now)) return 'now';
    const h = new Date(startMs).getHours();
    if (h < 6) return 'night';
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    return 'evening';
}

const startOf = (s: { scheduled_start?: string; actual_start?: string }): number => {
    const t = Date.parse(s.scheduled_start ?? s.actual_start ?? '');
    return Number.isFinite(t) ? t : Number.NaN;
};

/** 只回有場次的分帶（固定順序），帶內依時間升冪；沒有開始時間的場次略過 */
export function groupByBand<T extends { scheduled_start?: string; actual_start?: string }>(streams: readonly T[], now: number): Array<{ band: Band; items: T[] }> {
    const buckets = new Map<Band, Array<{ t: number; s: T }>>();
    for (const s of streams) {
        const t = startOf(s);
        if (!Number.isFinite(t)) continue;
        const b = bandOf(t, now);
        const list = buckets.get(b) ?? [];
        list.push({ t, s });
        buckets.set(b, list);
    }
    return BAND_ORDER.filter((b) => buckets.has(b)).map((band) => ({
        band,
        items: buckets.get(band)!.sort((a, b) => a.t - b.t).map((x) => x.s),
    }));
}
