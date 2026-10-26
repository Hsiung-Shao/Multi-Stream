/**
 * 單場歌回時間軸：右欄 MiniTimeline 的膠囊（歌曲片段）與細線（片段之間的直播聊天，播放時自動跳過）。
 *
 * - 純函式：先依 start 排序（不修改輸入），範圍是最早的 start 到最晚的 end。
 * - 片段之間有空檔（next.start > prev.end）才插入 chat 段；相鄰不插入，重疊時把前一段的 end 截到 next.start。
 * - offset、width 是佔整個範圍的 0–1 比例；寬度為 0 的段不輸出。
 */
export interface TimelineSegment {
    code?: string;
    start: number;
    end: number;
}

export interface TimelinePart {
    kind: 'song' | 'chat';
    start: number;
    end: number;
    /** 佔整個範圍的起點比例（0–1） */
    offset: number;
    /** 佔整個範圍的寬度比例（0–1） */
    width: number;
    code?: string;
}

export interface VideoTimeline {
    start: number;
    end: number;
    parts: TimelinePart[];
}

export function videoTimeline(segments: TimelineSegment[]): VideoTimeline {
    if (segments.length === 0) return { start: 0, end: 0, parts: [] };
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const start = sorted[0].start;
    const end = Math.max(...sorted.map((s) => s.end));
    const span = end - start;
    const parts: TimelinePart[] = [];
    const push = (kind: TimelinePart['kind'], from: number, to: number, code?: string) => {
        if (span <= 0 || to <= from) return;
        const part: TimelinePart = { kind, start: from, end: to, offset: (from - start) / span, width: (to - from) / span };
        if (code !== undefined) part.code = code;
        parts.push(part);
    };
    let prevEnd: number | null = null;
    sorted.forEach((seg, i) => {
        if (prevEnd !== null && seg.start > prevEnd) push('chat', prevEnd, seg.start);
        const next = sorted[i + 1];
        const segEnd = next && next.start < seg.end ? next.start : seg.end;
        push('song', seg.start, segEnd, seg.code);
        prevEnd = Math.max(prevEnd ?? segEnd, segEnd);
    });
    return { start, end, parts };
}

/** 歌曲總長＝各片段長度加總（實際聽得到的長度） */
export const songsDuration = (segments: TimelineSegment[]): number =>
    segments.reduce((sum, s) => sum + (s.end - s.start), 0);

/** 影片跨度＝最晚結束−最早開始；空陣列為 0 */
export function videoSpan(segments: TimelineSegment[]): number {
    if (segments.length === 0) return 0;
    return Math.max(...segments.map((s) => s.end)) - Math.min(...segments.map((s) => s.start));
}
