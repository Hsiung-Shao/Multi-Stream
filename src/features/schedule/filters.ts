// 週表的過濾與分組（純函式，測試直接餵資料）。

import type {
    ScheduleChannel,
    ScheduleFilterState,
    ScheduleSnapshot,
    ScheduleStream,
    ScheduleTab,
} from './types';

/** 收藏比對用的鍵：YouTube 頻道 ID 原樣、Twitch login 轉小寫 */
export interface FavoriteKeys {
    youtube: Set<string>;
    twitch: Set<string>;
}

interface FavoriteLike {
    platform: string;
    channelId?: string | null;
}

export function toFavoriteKeys(favorites: readonly FavoriteLike[]): FavoriteKeys {
    const youtube = new Set<string>();
    const twitch = new Set<string>();
    for (const f of favorites) {
        if (!f.channelId) continue;
        if (f.platform === 'youtube') youtube.add(f.channelId);
        else if (f.platform === 'twitch') twitch.add(f.channelId.toLowerCase());
    }
    return { youtube, twitch };
}

/** 這個實況主是不是收藏：任一平台的頻道在收藏裡就算（同一人的另一平台場次也一起顯示） */
export function isFavoriteChannel(ch: ScheduleChannel | undefined, keys: FavoriteKeys): boolean {
    if (!ch) return false;
    if (ch.youtube && keys.youtube.has(ch.youtube)) return true;
    if (ch.twitch && keys.twitch.has(ch.twitch.toLowerCase())) return true;
    return false;
}

const KNOWN_NATIONALITIES = new Set(['TW', 'HK', 'MY', 'JP']);

function matchesNationality(ch: ScheduleChannel | undefined, want: ScheduleFilterState['nationality']): boolean {
    if (want === 'all') return true;
    const n = ch?.nationality ?? 'OTHER';
    if (want === 'OTHER') return !KNOWN_NATIONALITIES.has(n);
    return n === want;
}

/**
 * 依篩選條件過濾一個分頁的場次。
 * 收藏範圍時不套國籍篩選：使用者自己挑的頻道，不該因為預設 TW 被藏起來。
 */
export function filterStreams(
    snapshot: ScheduleSnapshot,
    tab: ScheduleTab,
    filters: ScheduleFilterState,
    favorites: FavoriteKeys,
): ScheduleStream[] {
    return snapshot[tab].filter((s) => {
        const ch = snapshot.channels[s.vtuber_id];
        if (filters.platform !== 'all' && s.platform !== filters.platform) return false;
        if (filters.group !== 'all' && ch?.group !== filters.group) return false;
        if (filters.scope === 'favorites') return isFavoriteChannel(ch, favorites);
        return matchesNationality(ch, filters.nationality);
    });
}

/** snapshot 裡出現過的團體（依名稱排序），給團體下拉選單 */
export function listGroups(snapshot: ScheduleSnapshot): string[] {
    const set = new Set<string>();
    for (const ch of Object.values(snapshot.channels)) if (ch.group) set.add(ch.group);
    return [...set].sort((a, b) => a.localeCompare(b));
}

/** 各分頁在目前篩選下的筆數（分頁標籤上的數字） */
export function countByTab(
    snapshot: ScheduleSnapshot,
    filters: ScheduleFilterState,
    favorites: FavoriteKeys,
): Record<ScheduleTab, number> {
    return {
        live: filterStreams(snapshot, 'live', filters, favorites).length,
        upcoming: filterStreams(snapshot, 'upcoming', filters, favorites).length,
        recent: filterStreams(snapshot, 'recent', filters, favorites).length,
    };
}

/** 本地時區的日期鍵（YYYY-MM-DD），用來把場次分到「哪一天」 */
export function localDayKey(iso: string, timeZone?: string): string {
    const d = new Date(iso);
    // en-CA 的日期格式就是 YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export interface DayBucket {
    dayKey: string;
    streams: ScheduleStream[];
}

/**
 * 「即將開台」依本地日期分組：從今天起連續 7 天（沒有場次的日子也保留，看板欄位才對齊），
 * 超出 7 天的併進最後一天；每天內依排定時間排序。
 */
export function groupByDay(streams: readonly ScheduleStream[], now: number, timeZone?: string, days = 7): DayBucket[] {
    const keys: string[] = [];
    for (let i = 0; i < days; i++) keys.push(localDayKey(new Date(now + i * 86_400_000).toISOString(), timeZone));
    // 夏令時間或時區邊界可能讓兩個 i 落在同一天：去重後保持順序
    const uniqueKeys = [...new Set(keys)];
    const buckets = new Map<string, ScheduleStream[]>(uniqueKeys.map((k) => [k, []]));
    const first = uniqueKeys[0];
    const last = uniqueKeys[uniqueKeys.length - 1];
    for (const s of streams) {
        if (!s.scheduled_start) continue;
        let key = localDayKey(s.scheduled_start, timeZone);
        if (key < first) key = first; // 已過排定時間但還沒開（3 小時內）：放今天
        if (key > last) key = last;
        buckets.get(key)?.push(s);
    }
    const byStart = (a: ScheduleStream, b: ScheduleStream) => Date.parse(a.scheduled_start ?? '') - Date.parse(b.scheduled_start ?? '');
    return uniqueKeys.map((dayKey) => ({ dayKey, streams: (buckets.get(dayKey) ?? []).sort(byStart) }));
}

/** 同一個小時（本地時區）開始的場次：「選取這個時段」用 */
export function sameHourKeys(streams: readonly ScheduleStream[], anchor: ScheduleStream, timeZone?: string): ScheduleStream[] {
    if (!anchor.scheduled_start) return [anchor];
    const hourOf = (iso: string) =>
        new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).format(new Date(iso));
    const target = hourOf(anchor.scheduled_start);
    return streams.filter((s) => s.scheduled_start && hourOf(s.scheduled_start) === target);
}

/** 直播中依觀看數排序（snapshot 已排，這裡保險再排一次；過濾後順序不變） */
export function sortLive(streams: readonly ScheduleStream[]): ScheduleStream[] {
    return [...streams].sort((a, b) => (b.viewer_count ?? 0) - (a.viewer_count ?? 0));
}
