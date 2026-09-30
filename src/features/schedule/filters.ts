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

export interface FavoriteLike {
    platform: string;
    channelId?: string | null;
    url?: string | null;
}

/**
 * 收藏項目的頻道識別：YouTube 頻道 ID、Twitch login（小寫）。
 * 舊資料可能沒有 channelId，改從網址取（twitch.tv/<login>、youtube.com/channel/<UC…>）。
 * 週表的愛心顯示（toFavoriteKeys）與切換（useFavoriteChannel.favoritesOf）共用這一個函式，避免兩邊判斷不一致。
 */
export function favoriteChannelKey(f: FavoriteLike): { platform: 'youtube' | 'twitch'; id: string } | null {
    if (f.platform === 'youtube') {
        const id = f.channelId || f.url?.match(/youtube\.com\/channel\/(UC[\w-]+)/)?.[1];
        return id ? { platform: 'youtube', id } : null;
    }
    if (f.platform === 'twitch') {
        const id = f.channelId || f.url?.match(/twitch\.tv\/([^/?#]+)/)?.[1];
        return id ? { platform: 'twitch', id: id.toLowerCase() } : null;
    }
    return null;
}

export function toFavoriteKeys(favorites: readonly FavoriteLike[]): FavoriteKeys {
    const youtube = new Set<string>();
    const twitch = new Set<string>();
    for (const f of favorites) {
        const key = favoriteChannelKey(f);
        if (key?.platform === 'youtube') youtube.add(key.id);
        else if (key?.platform === 'twitch') twitch.add(key.id);
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

/** 搜尋字正規化：全半形統一（NFKC）、不分大小寫、去頭尾空白 */
export function normalizeQuery(q: string): string {
    return q.normalize('NFKC').toLowerCase().trim();
}

function includesQ(value: string | undefined, q: string): boolean {
    return !!value && value.normalize('NFKC').toLowerCase().includes(q);
}

/** 實況主本身是否符合搜尋字（名字、網址 slug、團體、所屬公司、合作公司） */
export function channelMatchesQuery(ch: ScheduleChannel | undefined, q: string): boolean {
    if (!q) return true;
    if (!ch) return false;
    return (
        includesQ(ch.name, q) || includesQ(ch.slug, q) || includesQ(ch.group, q) || includesQ(ch.agency, q) || !!ch.collabs?.some((a) => includesQ(a, q))
    );
}

/** 場次是否符合搜尋字：實況主符合，或標題、遊戲分類符合（q 需先 normalizeQuery） */
export function matchesQuery(ch: ScheduleChannel | undefined, s: ScheduleStream, q: string): boolean {
    if (!q) return true;
    return channelMatchesQuery(ch, q) || includesQ(s.title, q) || includesQ(s.category, q);
}

/**
 * 依篩選條件過濾一個分頁的場次。
 * - 收藏範圍時不套國籍篩選：使用者自己挑的頻道，不該因為預設 TW 被藏起來。
 * - 有搜尋字時不套國籍與所屬篩選：使用者在找特定的人（例如日本的實況主），不該被預設 TW 藏起來；平台與收藏範圍照套。
 * - 選了特定企業勢時不套國籍篩選（2026-09-30 使用者裁定）：要看的是這家的所有人（含非台灣成員與合作藝人），與成員名冊一致。
 */
export function filterStreams(
    snapshot: ScheduleSnapshot,
    tab: ScheduleTab,
    filters: ScheduleFilterState,
    favorites: FavoriteKeys,
    query = '',
): ScheduleStream[] {
    const q = normalizeQuery(query);
    return snapshot[tab].filter((s) => {
        const ch = snapshot.channels[s.vtuber_id];
        if (filters.platform !== 'all' && s.platform !== filters.platform) return false;
        if (q) {
            if (!matchesQuery(ch, s, q)) return false;
            return filters.scope === 'favorites' ? isFavoriteChannel(ch, favorites) : true;
        }
        if (!matchesAgency(ch, filters.group)) return false;
        if (filters.scope === 'favorites') return isFavoriteChannel(ch, favorites);
        if (isSpecificAgency(filters.group)) return true;
        return matchesNationality(ch, filters.nationality);
    });
}

/**
 * 搜尋框下方的「實況主」捷徑：名字等符合的實況主（只限這份 snapshot 裡有場次的人），名字開頭符合的排前面。
 */
export function listMatchingChannels(snapshot: ScheduleSnapshot, query: string, limit = 8): { id: string; channel: ScheduleChannel }[] {
    const q = normalizeQuery(query);
    if (!q) return [];
    const hits: { id: string; channel: ScheduleChannel; rank: number }[] = [];
    for (const [id, ch] of Object.entries(snapshot.channels)) {
        if (!channelMatchesQuery(ch, q)) continue;
        const name = ch.name.normalize('NFKC').toLowerCase();
        hits.push({ id, channel: ch, rank: name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2 });
    }
    return hits
        .sort((a, b) => a.rank - b.rank || a.channel.name.localeCompare(b.channel.name))
        .slice(0, limit)
        .map(({ id, channel }) => ({ id, channel }));
}

/** 「所屬」選的是某一家企業勢（不是全部／所有企業勢／非企業勢） */
export function isSpecificAgency(group: string): boolean {
    return group !== 'all' && group !== GROUP_ANY_AGENCY && group !== GROUP_NO_AGENCY;
}

/**
 * 所屬篩選：不限／所有企業勢／非企業勢／指定企業勢。合作藝人一律算企業勢（2026-09-30 使用者裁定）：
 * 有合作就出現在「所有企業勢」與該公司，不出現在「非企業勢」。
 */
export function matchesAgency(ch: ScheduleChannel | undefined, want: string): boolean {
    if (want === 'all') return true;
    const hasAgency = !!ch?.agency || !!ch?.collabs?.length;
    if (want === GROUP_ANY_AGENCY) return hasAgency;
    if (want === GROUP_NO_AGENCY) return !hasAgency;
    return ch?.agency === want || !!ch?.collabs?.includes(want);
}

/** 「所屬」選單的一家企業勢：count＝這份 snapshot 裡有場次的人數（正式所屬＋合作） */
export interface AgencyOption {
    name: string;
    count: number;
}

/**
 * 「所屬」下拉選單：全部企業勢（snapshot.agencies），本週有場次的依人數多到少在前，沒有場次的依名稱排在後面（仍可選，看成員名冊）。
 * 只列企業勢：台灣有兩百多個社團與未查證的小團體，全列會讓下拉無法使用（卡片上仍顯示團名）。
 * 人數與 matchesAgency 同一口徑：正式所屬＋合作。舊版 snapshot 沒有 agencies 時只列有場次的。
 */
export function listGroups(snapshot: ScheduleSnapshot): AgencyOption[] {
    const count = new Map<string, number>();
    for (const name of snapshot.agencies ?? []) count.set(name, 0);
    for (const ch of Object.values(snapshot.channels)) {
        for (const a of new Set([ch.agency, ...(ch.collabs ?? [])])) if (a) count.set(a, (count.get(a) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')).map(([name, n]) => ({ name, count: n }));
}

/** 存下的「所屬」值在這份 snapshot 還有效嗎：全部、所有企業勢、非企業勢，或選單裡有的公司（snapshot 完全沒有所屬資料時只有「全部」有效） */
export function isValidGroup(group: string, groups: readonly AgencyOption[]): boolean {
    if (group === 'all') return true;
    if (!groups.length) return false;
    return !isSpecificAgency(group) || groups.some((g) => g.name === group);
}

/** 各分頁在目前篩選下的筆數（分頁標籤上的數字） */
export function countByTab(
    snapshot: ScheduleSnapshot,
    filters: ScheduleFilterState,
    favorites: FavoriteKeys,
    query = '',
): Record<ScheduleTab, number> {
    return {
        live: filterStreams(snapshot, 'live', filters, favorites, query).length,
        upcoming: filterStreams(snapshot, 'upcoming', filters, favorites, query).length,
        recent: filterStreams(snapshot, 'recent', filters, favorites, query).length,
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

/**
 * 直播中依開播時間排序，新開播的在前（snapshot 已排，這裡保險再排一次）。
 * 不顯示觀看人數（2026-09-30 使用者裁定：直播狀態改由 live-og 判斷，拿不到人數，也不為人數用 API）
 */
export function sortLive(streams: readonly ScheduleStream[]): ScheduleStream[] {
    const t = (s: ScheduleStream) => (s.actual_start ? Date.parse(s.actual_start) : 0);
    return [...streams].sort((a, b) => t(b) - t(a));
}
