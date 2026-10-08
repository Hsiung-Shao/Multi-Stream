/**
 * 公開頁使用者回報的日期（/api/status 的 feedbacks[].created_at 只回 'YYYY-MM-DD'）→ 依 locale 的日期字串
 *
 * 不能用 new Date('YYYY-MM-DD')：那會被當成 UTC 午夜，在負時區（美洲）顯示成前一天。
 * 這裡拆出年月日、以本地時間正午建立 Date，任何時區都是同一天。格式不符回空字串。
 */
export function formatPublicDate(day: string | null | undefined, locale: string): string {
    const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
    if (!m) return '';
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(y, mo - 1, d, 12);
    // 不存在的日期（2026-02-31、2026-13-01）會被 Date 自動進位成別天：回推不一致就不顯示
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return '';
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
}
