// 週表的過濾與分組（純函式，測試直接餵資料）。

import type {
    ScheduleChannel,
    ScheduleFilterState,
    ScheduleSnapshot,
    ScheduleStream,
    ScheduleTab,
} from './types';
import { GROUP_ANY_AGENCY, GROUP_NO_AGENCY } from './types';

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
        if (!matchesAgency(ch, filters.group)) return false;
        if (filters.scope === 'favorites') return isFavoriteChannel(ch, favorites);
        return matchesNationality(ch, filters.nationality);
    });
}

/** 所屬篩選：不限／所有企業勢／非企業勢／指定企業勢 */
export function matchesAgency(ch: ScheduleChannel | undefined, want: string): boolean {
    if (want === 'all') return true;
    if (want === GROUP_ANY_AGENCY) return !!ch?.agency;
    if (want === GROUP_NO_AGENCY) return !ch?.agency;
    return ch?.agency === want;
}

/**
 * snapshot 裡出現過的企業勢（依週表上的人數多到少，同數依名稱），給「所屬」下拉選單。
 * 只列企業勢：台灣有兩百多個社團與未查證的小團體，全列會讓下拉無法使用（卡片上仍顯示團名）。
 */
export function listGroups(snapshot: ScheduleSnapshot): string[] {
    const count = new Map<string, number>();
    for (const ch of Object.values(snapshot.channels)) if (ch.agency) count.set(ch.agency, (count.get(ch.agency) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
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

export interface HourBucket {
    /** 該整點（本地時區）的 ISO 時間 */
    hourIso: string;
    streams: ScheduleStream[];
}

/** 一天內依本地整點分組（輸入需已依排定時間排序） */
export function groupByHour(streams: readonly ScheduleStream[]): HourBucket[] {
    const out: HourBucket[] = [];
    for (const s of streams) {
        if (!s.scheduled_start) continue;
        const d = new Date(s.scheduled_start);
        d.setMinutes(0, 0, 0);
        const hourIso = d.toISOString();
        const last = out[out.length - 1];
        if (last && last.hourIso === hourIso) last.streams.push(s);
        else out.push({ hourIso, streams: [s] });
    }
    return out;
}

/** 預設顯示哪一天：今天有場次就今天，否則第一個有場次的日子，全空就今天 */
export function pickDefaultDay(days: readonly DayBucket[]): string | null {
    if (days.length === 0) return null;
    return (days.find((d) => d.streams.length > 0) ?? days[0]).dayKey;
}

/**
 * 今天的時間軸上「現在」線要插在哪個整點組之前：第一個整點 ≥ 目前整點的組。
 * 回傳 -1 表示全部都在現在之前（例如只剩過了預定時間還沒開的場次）。
 */
export function nowDividerIndex(hours: readonly HourBucket[], now: number): number {
    const current = new Date(now);
    current.setMinutes(0, 0, 0);
    return hours.findIndex((h) => Date.parse(h.hourIso) >= current.getTime());
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
