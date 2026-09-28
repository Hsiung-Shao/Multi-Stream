// 週表的時間顯示：一律用瀏覽器時區，語言跟隨 i18n。

const cache = new Map<string, Intl.DateTimeFormat>();

function fmt(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = `${locale}|${JSON.stringify(options)}`;
    let f = cache.get(key);
    if (!f) {
        f = new Intl.DateTimeFormat(locale, options);
        cache.set(key, f);
    }
    return f;
}

/** 20:30 */
export function formatClock(iso: string | undefined, locale: string): string {
    if (!iso) return '';
    return fmt(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** 9/29（週二） 20:30 */
export function formatDayTime(iso: string | undefined, locale: string): string {
    if (!iso) return '';
    return fmt(locale, { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** 看板欄位標題：9/29 週二 */
export function formatDayHeading(dayKey: string, locale: string): string {
    // dayKey 是本地日期 YYYY-MM-DD；用正午建立 Date 避免時區把日期推到前一天
    const [y, m, d] = dayKey.split('-').map(Number);
    return fmt(locale, { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(y, m - 1, d, 12));
}

/** 「3 分鐘前」「2 小時前」 */
export function formatRelative(iso: string | undefined, now: number, locale: string): string {
    if (!iso) return '';
    const diffMin = Math.round((Date.parse(iso) - now) / 60_000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
    const diffHour = Math.round(diffMin / 60);
    if (Math.abs(diffHour) < 48) return rtf.format(diffHour, 'hour');
    return rtf.format(Math.round(diffHour / 24), 'day');
}
