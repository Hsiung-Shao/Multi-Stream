/**
 * 「取代現有片段」（後台、社群投稿頁共用）：把重新解析的時間軸列（incoming）對回舊片段，保住既有的 id 與分享用 code。
 *
 * - 純函式、零 DOM。配對規則：incoming 依序，各找一筆「尚未配對、start 相同、帶 id 或 code」的舊列，帶上它的 id（有才帶）與 code。
 *   後台舊列有 id 與 code；社群投稿頁的舊列只有 code。
 * - 每個舊列只配一次；incoming 多於舊列的部分沒有 id／code（視為新片段）。
 * - 舊列有 code 卻沒配到 → 該 code 進 lostCodes（依舊列順序），讓 UI 警告「這些分享連結會失效」（投稿頁則改為保留舊片段）。
 *   沒有 id／code 的舊列（尚未存檔）不影響 lostCodes。
 * - 保留 incoming 的其他欄位與順序。
 * - 版本備註：incoming 沒有備註（缺欄、null、空白）時沿用配到的舊列備註；有就用新的。
 */
import type { ParsedRow } from './timelineParser';

export type MergedRow = ParsedRow & { id?: string; code?: string; note?: string | null };

export function mergeReplaceRows(
    existing: { id?: string; code?: string; start: number; note?: string | null }[],
    incoming: (ParsedRow & { note?: string | null })[],
): { rows: MergedRow[]; lostCodes: string[] } {
    const matched = new Set<number>();

    const rows = incoming.map((row): MergedRow => {
        const i = existing.findIndex((old, idx) => !matched.has(idx) && (old.id !== undefined || old.code !== undefined) && old.start === row.start);
        if (i < 0) return row;
        matched.add(i);
        const old = existing[i];
        const keepNote = !row.note?.trim() && !!old.note;
        return { ...row, ...(old.id !== undefined ? { id: old.id } : {}), ...(old.code !== undefined ? { code: old.code } : {}), ...(keepNote ? { note: old.note } : {}) };
    });

    const lostCodes: string[] = [];
    existing.forEach((old, idx) => {
        if (!matched.has(idx) && old.code) lostCodes.push(old.code);
    });

    return { rows, lostCodes };
}
