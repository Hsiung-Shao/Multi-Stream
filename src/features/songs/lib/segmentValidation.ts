/**
 * 歌曲片段驗證：後台儲存前的逐列檢查（functions/lib/songs.js 的伺服端檢查用同一組規則與 code 名稱）。
 *
 * - 純函式、零 DOM；回傳問題清單，空陣列代表通過。
 * - 單列：結束為 null → missing_end；結束 <= 開始 → end_before_start；歌名 trim 後為空 → empty_title。
 * - 有 duration 且結束超過 → exceeds_duration；歌名或原唱 trim 後超過 200 字 → title_too_long／artist_too_long。
 * - 重疊：[s1,e1) 與 [s2,e2) 若 s1 < e2 且 s2 < e1，兩列各報一次 overlap（同列只報一次）；首尾相接不算。
 *   只有結束合法（非 null 且大於開始）的列才參與重疊判斷，避免一個壞列連帶標紅其他列。
 */
export type SegmentIssueCode =
    | 'missing_end'
    | 'end_before_start'
    | 'overlap'
    | 'exceeds_duration'
    | 'empty_title'
    | 'title_too_long'
    | 'artist_too_long';

/** 歌名／原唱長度上限（與 functions/lib/songs.js 的 TITLE_MAX 一致） */
const TEXT_MAX = 200;

export interface SegmentIssue {
    index: number;
    code: SegmentIssueCode;
}

interface SegmentRow {
    start: number;
    end: number | null;
    title: string;
    artist?: string | null;
}

export function validateSegments(rows: SegmentRow[], opts?: { duration?: number | null }): SegmentIssue[] {
    const issues: SegmentIssue[] = [];
    const duration = opts?.duration ?? null;

    rows.forEach((row, index) => {
        if (row.end === null) {
            issues.push({ index, code: 'missing_end' });
        } else {
            if (row.end <= row.start) issues.push({ index, code: 'end_before_start' });
            if (duration !== null && row.end > duration) issues.push({ index, code: 'exceeds_duration' });
        }
        const title = row.title.trim();
        if (title === '') issues.push({ index, code: 'empty_title' });
        else if (title.length > TEXT_MAX) issues.push({ index, code: 'title_too_long' });
        if ((row.artist ?? '').trim().length > TEXT_MAX) issues.push({ index, code: 'artist_too_long' });
    });

    const overlapped = new Set<number>();
    for (let i = 0; i < rows.length; i++) {
        const a = rows[i];
        if (a.end === null || a.end <= a.start) continue;
        for (let j = i + 1; j < rows.length; j++) {
            const b = rows[j];
            if (b.end === null || b.end <= b.start) continue;
            if (a.start < b.end && b.start < a.end) {
                overlapped.add(i);
                overlapped.add(j);
            }
        }
    }
    for (const index of [...overlapped].sort((x, y) => x - y)) {
        issues.push({ index, code: 'overlap' });
    }

    return issues;
}
