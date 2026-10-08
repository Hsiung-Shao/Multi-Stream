/**
 * 公開頁使用者回報的日期（/api/status 的 feedbacks[].created_at 只回 'YYYY-MM-DD'）→ 依 locale 的日期字串
 *
 * 不能用 new Date('YYYY-MM-DD')：那會被當成 UTC 午夜，在負時區（美洲）顯示成前一天。
 * 這裡拆出年月日、以本地時間正午建立 Date，任何時區都是同一天。格式不符回空字串。
 */
export function formatPublicDate(day: string | null | undefined, locale: string): string {
    const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
    if (!m) return '';
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
}
