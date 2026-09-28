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
    viewer_count?: number;
    scheduled_start?: string;
    actual_start?: string;
    actual_end?: string;
}

export interface ScheduleSnapshot {
    version: 1;
    generated_at: string;
    heavy_refreshed_at?: string;
    channels: Record<string, ScheduleChannel>;
    live: ScheduleStream[];
    upcoming: ScheduleStream[];
    recent: ScheduleStream[];
}

export type ScheduleTab = 'live' | 'upcoming' | 'recent';

/** 國籍篩選：'all' 或 snapshot 裡的國籍代碼 */
export type NationalityFilter = 'all' | 'TW' | 'HK' | 'MY' | 'JP' | 'OTHER';
export type PlatformFilter = 'all' | SchedulePlatform;
export type ScopeFilter = 'all' | 'favorites';

export interface ScheduleFilterState {
    scope: ScopeFilter;
    nationality: NationalityFilter;
    /** 團體名稱；'all' 為不限 */
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
