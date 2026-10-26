/**
 * 片段表格的資料模型（後台編輯器與社群投稿頁共用；SegmentEditor 畫面用）。
 *
 * - 時間保留使用者輸入的文字（12:34、1:02:03、754），存檔／送出時才轉秒數。
 * - endEstimated：結束時間是估計值（estimateEnds 補的），使用者改過該列結束時間就清掉。
 * - 時間軸匯入：解析器會把「沒寫結束」的列補成下一首開始；粉絲時間軸幾乎都沒寫結束，
 *   直接採用會把歌與歌之間的聊天也包進片段。所以匯入時先看原文那一行有沒有寫區間：
 *   沒寫就當成沒有結束時間，交給 estimateEnds（下一首開始、開始＋6 分鐘、影片長度取最早）。
 */
import { formatTimecode, parseTimecode } from '../lib/timecode';
import { validateSegments, type SegmentIssueCode } from '../lib/segmentValidation';
import { estimateEnds } from '../lib/endEstimate';
import type { ParsedRow } from '../lib/timelineParser';

export interface SegmentRowDraft {
    key: string;
    /** 既有片段的 id（後台原地更新用；投稿頁不送） */
    id?: string;
    code?: string;
    start: string;
    end: string;
    title: string;
    artist: string;
    endEstimated?: boolean;
}

/** 列的問題代碼：segmentValidation 的代碼＋時間格式錯 */
export type RowIssueCode = SegmentIssueCode | 'start_format' | 'end_format';

let rowSeq = 0;
export const newRowKey = (): string => `row-${++rowSeq}`;

export const emptyRow = (start = ''): SegmentRowDraft => ({ key: newRowKey(), start, end: '', title: '', artist: '' });

export interface ImportedRow {
    start: number;
    end: number;
    title: string;
    artist: string | null;
    line: number;
    endEstimated: boolean;
    id?: string;
    code?: string;
}

export function fromImported(r: ImportedRow): SegmentRowDraft {
    return {
        key: r.id || newRowKey(),
        ...(r.id ? { id: r.id } : {}),
        ...(r.code ? { code: r.code } : {}),
        start: formatTimecode(r.start),
        end: formatTimecode(r.end),
        title: r.title,
        artist: r.artist ?? '',
        endEstimated: r.endEstimated,
    };
}

const RANGE_PREFIX_RE = /^\s*(?:#\d+|\d+[.)、])?\s*[[(【]?\s*\d{1,3}(?::\d{2}){1,2}\s*[-~–—〜]\s*\d{1,3}(?::\d{2}){1,2}/;

/** 原文這一行是不是寫了「開始-結束」區間（NFKC 後判斷，全形與數學粗體數字也認得） */
export function lineHasExplicitEnd(line: string): boolean {
    return RANGE_PREFIX_RE.test(line.normalize('NFKC'));
}

/**
 * 把解析結果轉成可匯入的列：原文沒寫區間的列結束時間改為估計（estimateEnds），保留原順序。
 * @param lines 原始時間軸文字的每一行（ParsedRow.line 對應這裡的索引）
 */
export function prepareImport(rows: ParsedRow[], lines: string[], duration: number | null): ImportedRow[] {
    const withExplicit = rows.map((r) => ({
        ...r,
        end: r.end !== null && lineHasExplicitEnd(lines[r.line] ?? '') ? r.end : null,
    }));
    return estimateEnds(withExplicit, { duration }).map((r) => ({
        start: r.start,
        end: r.end,
        title: r.title,
        artist: r.artist,
        line: r.line,
        endEstimated: r.endEstimated,
    }));
}

/** 逐列問題（index → 代碼）；時間格式錯的列不參與 validateSegments，避免連帶誤判重疊 */
export function computeRowIssues(rows: SegmentRowDraft[], duration: number | null): Map<number, RowIssueCode[]> {
    const issues = new Map<number, RowIssueCode[]>();
    const push = (i: number, code: RowIssueCode) => issues.set(i, [...(issues.get(i) ?? []), code]);
    const valid: { index: number; start: number; end: number | null; title: string; artist: string }[] = [];
    rows.forEach((r, i) => {
        const start = parseTimecode(r.start);
        const end = r.end.trim() ? parseTimecode(r.end) : null;
        if (start === null) push(i, 'start_format');
        if (r.end.trim() && end === null) push(i, 'end_format');
        if (start !== null && !(r.end.trim() && end === null)) valid.push({ index: i, start, end, title: r.title, artist: r.artist });
    });
    for (const issue of validateSegments(valid, { duration })) {
        push(valid[issue.index].index, issue.code);
    }
    return issues;
}

/** 表格列 → 秒數（呼叫前應先確認 computeRowIssues 沒有問題） */
export function rowSeconds(r: SegmentRowDraft): { start: number; end: number | null } {
    return { start: parseTimecode(r.start) ?? 0, end: r.end.trim() ? parseTimecode(r.end) : null };
}
