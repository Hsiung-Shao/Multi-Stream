import type { StreamStatus, Tier } from './rules.ts';

/** vtuber_channels 的一列（排程需要的欄位）＋ 分級狀態 */
export interface RosterChannel {
  channelId: string; // vtuber_channels.id
  vtuberId: string;
  platform: 'youtube' | 'twitch';
  externalId: string; // YouTube: UC…；Twitch: broadcaster id
  displayName: string | null;
  tier: Tier | null;
  rssFailStreak: number;
}

/** public.streams 的一列（寫入時的完整欄位集；批次 upsert 要求每筆欄位一致） */
export interface StreamRow extends Record<string, unknown> {
  vtuber_id: string;
  channel_id: string;
  platform: 'youtube' | 'twitch';
  external_id: string;
  source: 'yt_waiting_room' | 'twitch_schedule' | 'twitch_live' | 'manual';
  status: StreamStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  title: string | null;
  category: string | null;
  thumbnail_url: string | null;
  viewer_count: number | null;
  is_schedule_frame: boolean;
  fetched_at: string;
}

/** 從資料庫讀出來的 streams 列（含 id） */
export interface StreamRecord extends StreamRow {
  id: string;
}

export interface RunStats extends Record<string, unknown> {
  job: 'heavy' | 'light';
  started_at: string;
  finished_at: string;
  duration_ms: number;
  budget_exhausted: boolean;
  channels_total: number;
  channels_processed: number;
  rss_ok: number;
  rss_failed: number;
  rss_rate_limited: number;
  /** 這一輪 RSS 失敗率過半，判定為 YouTube 整批限流（停止開新請求、失敗不算頻道） */
  rss_throttled: boolean;
  rss_skipped_dead: number;
  rss_entries: number;
  new_video_candidates: number;
  videos_list_calls: number;
  quota_units: number;
  /** 配額日（太平洋時間）累計用量，含本輪 */
  quota_daily_used: number;
  /** 因 API 上限延到下一輪再查的影片數 */
  api_deferred: number;
  /** live-og（/live 頁）：查了幾個頻道、失敗、判定直播中、待機、判定結束的場次 */
  og_checked: number;
  og_failed: number;
  og_live: number;
  og_upcoming: number;
  og_ended: number;
  streams_upserted: number;
  streams_hidden: number;
  streams_expired: number;
  pending_refreshed: number;
  twitch_streams_calls: number;
  twitch_live: number;
  twitch_ended: number;
  twitch_schedule_calls: number;
  twitch_schedule_channels: number;
  twitch_schedule_segments: number;
  twitch_schedule_canceled: number;
  twitch_schedule_failed: number;
  twitch_schedule_rate_limited: number;
  merges_changed: number;
  indexable_changed: number;
  live_status_rows: number;
  last_live_at_updated: number;
  snapshot_bytes: number;
  errors: string[];
}

export function emptyStats(job: 'heavy' | 'light', startedAt: number): RunStats {
  return {
    job,
    started_at: new Date(startedAt).toISOString(),
    finished_at: '',
    duration_ms: 0,
    budget_exhausted: false,
    channels_total: 0,
    channels_processed: 0,
    rss_ok: 0,
    rss_failed: 0,
    rss_rate_limited: 0,
    rss_throttled: false,
    rss_skipped_dead: 0,
    rss_entries: 0,
    new_video_candidates: 0,
    videos_list_calls: 0,
    quota_units: 0,
    quota_daily_used: 0,
    api_deferred: 0,
    og_checked: 0,
    og_failed: 0,
    og_live: 0,
    og_upcoming: 0,
    og_ended: 0,
    streams_upserted: 0,
    streams_hidden: 0,
    streams_expired: 0,
    pending_refreshed: 0,
    twitch_streams_calls: 0,
    twitch_live: 0,
    twitch_ended: 0,
    twitch_schedule_calls: 0,
    twitch_schedule_channels: 0,
    twitch_schedule_segments: 0,
    twitch_schedule_canceled: 0,
    twitch_schedule_failed: 0,
    twitch_schedule_rate_limited: 0,
    merges_changed: 0,
    indexable_changed: 0,
    live_status_rows: 0,
    last_live_at_updated: 0,
    snapshot_bytes: 0,
    errors: [],
  };
}
