// 開台週表 snapshot 的前端型別。
// 來源：Supabase Storage public bucket `streams` 的 `v1/snapshot.json`，由排程 Edge Function 發布。
// 必須與後端 supabase/functions/_shared/snapshot.ts 的 Snapshot / SnapshotStream / SnapshotChannel 對齊；
// 時間欄位為 null 時後端直接省略，所以這裡全部是 optional。

export type SchedulePlatform = 'youtube' | 'twitch';

export interface ScheduleChannel {
    name: string;
    avatar?: string;
    group?: string;
    /** TW / HK / MY / JP / KR / OTHER */
    nationality: string;
    /** YouTube 頻道 ID（UC…） */
    youtube?: string;
    /** Twitch login（小寫） */
    twitch?: string;
    /** 個人週表頁網址 /schedule/<slug>（vtubers.slug，產生後固定） */
    slug?: string;
    /** 所屬企業勢（公司名）；社團、個人工作室、未查證的團體沒有這個欄位 */
    agency?: string;
    /** 合作中的企業勢（公司名；不含 agency）：合作藝人不是正式所屬，但選這家公司時要帶出來 */
    collabs?: string[];
}

/** 同一場的另一個平台（雙平台同步開台時，後端把次要場次併進主場次，主場次優先 YouTube） */
export interface ScheduleAlso {
    platform: SchedulePlatform;
    external_id: string;
    source: string;
}

export interface ScheduleStream {
    vtuber_id: string;
    platform: SchedulePlatform;
    /** YouTube: videoId；Twitch: stream id */
    external_id: string;
    source: 'yt_waiting_room' | 'twitch_schedule' | 'twitch_live' | 'manual' | string;
    status: 'scheduled' | 'live' | 'ended' | string;
    title?: string;
    category?: string;
    scheduled_start?: string;
    actual_start?: string;
    actual_end?: string;
    /** 併進這一場的其他平台場次（例：YouTube 待機室＋同時段的 Twitch 週表） */
    also?: ScheduleAlso[];
}

export interface ScheduleSnapshot {
    version: 1;
    generated_at: string;
    heavy_refreshed_at?: string;
    channels: Record<string, ScheduleChannel>;
    live: ScheduleStream[];
    upcoming: ScheduleStream[];
    recent: ScheduleStream[];
    /** 所有企業勢（頂層公司）；舊版 snapshot 沒有 */
    agencies?: string[];
}

export type ScheduleTab = 'live' | 'upcoming' | 'recent';

/** 國籍篩選：'all' 或 snapshot 裡的國籍代碼 */
export type NationalityFilter = 'all' | 'TW' | 'HK' | 'MY' | 'JP' | 'OTHER';
export type PlatformFilter = 'all' | SchedulePlatform;
export type ScopeFilter = 'all' | 'favorites';

/** 所屬篩選的兩個特殊值：所有企業勢、非企業勢；其餘值是企業勢（公司）名稱 */
export const GROUP_ANY_AGENCY = '__agency';
export const GROUP_NO_AGENCY = '__indie';

export interface ScheduleFilterState {
    scope: ScopeFilter;
    nationality: NationalityFilter;
    /** 所屬：'all' 不限／GROUP_ANY_AGENCY／GROUP_NO_AGENCY／企業勢名稱（沿用 group 鍵名，舊的儲存值會自動回到 all） */
    group: string;
    platform: PlatformFilter;
}

/** 公共週表預設只顯示 TW（2026-09-29 使用者裁定） */
export const DEFAULT_FILTERS: ScheduleFilterState = {
    scope: 'all',
    nationality: 'TW',
    group: 'all',
    platform: 'all',
};

/** 卡片的選取鍵：(platform, external_id) 在 snapshot 內唯一 */
export const streamKey = (s: Pick<ScheduleStream, 'platform' | 'external_id'>): string => `${s.platform}:${s.external_id}`;
