/** 開台日期顯示成 YYYY/MM/DD（使用者當地時區）；沒有或無法解析時 null */
export function formatYmd(value: string | number | null): string | null {
    if (value === null) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}
