/**
 * 後台新增歌回時，用週表查到的直播資料自動帶入欄位。
 *
 * - 純函式、零 DOM。只補「空欄位」，絕不覆蓋使用者已填的值：
 *   title trim 後為空字串、vtuberId／streamedAt 為 null 或空字串才算空。
 * - found 的對應欄位也是空的就不動現值；found 為 null 回原值的複本（新物件）。
 */
export interface PrefillFields {
    title: string;
    vtuberId: string | null;
    streamedAt: string | null;
}

export function mergePrefill(
    current: PrefillFields,
    found: { title: string | null; vtuberId: string | null; streamedAt: string | null } | null,
): PrefillFields {
    if (!found) return { ...current };
    return {
        title: current.title.trim() === '' && found.title && found.title.trim() ? found.title : current.title,
        vtuberId: !current.vtuberId && found.vtuberId ? found.vtuberId : current.vtuberId,
        streamedAt: !current.streamedAt && found.streamedAt ? found.streamedAt : current.streamedAt,
    };
}
