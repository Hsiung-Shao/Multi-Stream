// 週表業務規則（純函式，vitest 直接測）。
//
// 門檻值來源：Claude Docs「MultiStream Hub 開台周表規劃 v1」的「業務規則」與 2026-09-28 裁定。
// 常駐框天數：週表用 14 天（暫定值）。現有 live-og 端點的 toLiveStatusRow 用 30 天，
// 兩邊統一成這裡的 SCHEDULE_FRAME_DAYS（決策紀錄有寫）。

export const SCHEDULE_FRAME_DAYS = 14;
export const EXPIRE_AFTER_HOURS = 3;
export const TIER1_DAYS = 30;
export const TIER2_DAYS = 90;
/** 本週表只看未來 7 天 + 過去 12 小時（本地實測 24 小時的 recent 有 430 場、佔 snapshot 三分之一） */
export const UPCOMING_WINDOW_DAYS = 7;
export const RECENT_WINDOW_HOURS = 12;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type StreamStatus = 'scheduled' | 'live' | 'ended' | 'expired' | 'canceled' | 'hidden';
export type Tier = 1 | 2 | 3;

/** 排定時間距今超過門檻天數 → 常駐框 */
export function isScheduleFrame(scheduledStart: string | Date | null | undefined, now: number): boolean {
  if (!scheduledStart) return false;
  const t = typeof scheduledStart === 'string' ? Date.parse(scheduledStart) : scheduledStart.getTime();
  if (!Number.isFinite(t)) return false;
  return t - now > SCHEDULE_FRAME_DAYS * DAY_MS;
}

/** scheduled 狀態、排定時間過後 EXPIRE_AFTER_HOURS 仍未開始 → expired */
export function isExpired(
  stream: { status: StreamStatus; scheduled_start: string | null; actual_start: string | null },
  now: number,
): boolean {
  if (stream.status !== 'scheduled' || stream.actual_start) return false;
  if (!stream.scheduled_start) return false;
  const t = Date.parse(stream.scheduled_start);
  return Number.isFinite(t) && now - t > EXPIRE_AFTER_HOURS * HOUR_MS;
}

/** videos.list 的 liveStreamingDetails + liveBroadcastContent → 場次狀態 */
export interface YouTubeVideoFacts {
  liveBroadcastContent: 'live' | 'upcoming' | 'none' | string;
  scheduledStartTime?: string | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  hasLiveStreamingDetails: boolean;
}

export type VideoClassification =
  | { kind: 'stream'; status: StreamStatus; is_schedule_frame: boolean }
  | { kind: 'video' }; // 一般上傳（或首映結束後沒有直播細節），不進 streams

export function classifyYouTubeVideo(v: YouTubeVideoFacts, now: number): VideoClassification {
  if (!v.hasLiveStreamingDetails) return { kind: 'video' };
  if (v.liveBroadcastContent === 'live') {
    return { kind: 'stream', status: 'live', is_schedule_frame: false };
  }
  if (v.liveBroadcastContent === 'upcoming') {
    return { kind: 'stream', status: 'scheduled', is_schedule_frame: isScheduleFrame(v.scheduledStartTime, now) };
  }
  // none：已結束的直播；沒有 actualStart 但有 scheduledStart 也沒開播 → 當作取消（不會出現在待機室）
  if (v.actualEndTime || v.actualStartTime) return { kind: 'stream', status: 'ended', is_schedule_frame: false };
  if (v.scheduledStartTime) return { kind: 'stream', status: 'canceled', is_schedule_frame: false };
  return { kind: 'video' };
}

/** 活躍度分級：video_count 在 30 天內有增加 → T1；31～90 天內 → T2；其餘 T3。graduate 不分級。 */
export interface TierInput {
  activity: string; // vtubers.activity
  videoCountNow: number | null;
  videoCount30: number | null; // 約 30 天前的切面
  videoCount90: number | null; // 約 90 天前的切面
  /** 排程自己觀察到的最近新影片時間（RSS），可把 T2/T3 立刻升 T1 */
  lastNewVideoAt?: string | null;
}

export function computeTier(input: TierInput, now: number): { tier: Tier; reason: string } | null {
  if (input.activity === 'graduate') return null;
  const recent = input.lastNewVideoAt ? Date.parse(input.lastNewVideoAt) : NaN;
  if (Number.isFinite(recent) && now - recent <= TIER1_DAYS * DAY_MS) {
    return { tier: 1, reason: 'rss_new_video_30d' };
  }
  const nowC = input.videoCountNow;
  if (nowC != null && input.videoCount30 != null && nowC > input.videoCount30) {
    return { tier: 1, reason: 'video_count_up_30d' };
  }
  if (nowC != null && input.videoCount90 != null && nowC > input.videoCount90) {
    return { tier: 2, reason: 'video_count_up_90d' };
  }
  if (Number.isFinite(recent) && now - recent <= TIER2_DAYS * DAY_MS) {
    return { tier: 2, reason: 'rss_new_video_90d' };
  }
  // 沒有任何切面資料（新頻道）：先當 T2 觀察，Light 偵測到活動會升 T1
  if (nowC == null || (input.videoCount30 == null && input.videoCount90 == null)) {
    return { tier: 2, reason: 'no_metrics' };
  }
  return { tier: 3, reason: 'inactive_90d' };
}

/**
 * 資料來源優先序（2026-09-30 使用者裁定）：直播狀態以 live-og（/live 頁）為主、RSS 為輔（只發現新影片）、
 * YouTube Data API 最後（只查 RSS 新發現影片的待機室時間），不再有 RSS 失敗後的 API 備援。
 *
 * RSS 整批限流：YouTube 對同一 IP 大量抓 RSS 時會回快速的 404／500（不是 429），實測連續兩天
 * UTC 01:00–07:00 失敗率 70–99%，事後重測同一批頻道全部正常。同一輪累計嘗試達門檻、失敗率過半 → 整批限流：
 * 停止開新請求，而且這一輪的失敗不算在頻道頭上。
 */
export const RSS_THROTTLE_MIN_ATTEMPTS = 20;
export const RSS_THROTTLE_FAIL_RATIO = 0.5;
export function isRssThrottled(attempts: number, failures: number): boolean {
  return attempts >= RSS_THROTTLE_MIN_ATTEMPTS && failures / attempts >= RSS_THROTTLE_FAIL_RATIO;
}

/** YouTube Data API 上限：每次執行最多幾次 videos.list（每次 1 單位、50 支），以及每日總額（依太平洋時間的日期歸零） */
export const MAX_VIDEOS_LIST_CALLS_PER_RUN = 4;
export const DAILY_QUOTA_CAP = 2_000;

/** 配額日（YouTube 在太平洋時間午夜重置）：YYYY-MM-DD */
export function quotaDay(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

/** 非限流輪次裡 RSS 連續失敗達此數 → 視為死頻道，掃描時跳過（Heavy 每圈開頭歸零再試一次） */
export const RSS_FAIL_STREAK_DEAD = 10;
export function shouldSkipChannel(rssFailStreak: number): boolean {
  return rssFailStreak >= RSS_FAIL_STREAK_DEAD;
}

/** 進 snapshot 的 upcoming：未來 7 天內、非常駐框、狀態 scheduled */
export function isUpcomingForSnapshot(
  s: { status: StreamStatus; scheduled_start: string | null; is_schedule_frame: boolean },
  now: number,
): boolean {
  if (s.status !== 'scheduled' || s.is_schedule_frame || !s.scheduled_start) return false;
  const t = Date.parse(s.scheduled_start);
  if (!Number.isFinite(t)) return false;
  return t <= now + UPCOMING_WINDOW_DAYS * DAY_MS && t >= now - EXPIRE_AFTER_HOURS * HOUR_MS;
}

/** 進 snapshot 的 recent：過去 24 小時內結束 */
export function isRecentForSnapshot(s: { status: StreamStatus; actual_end: string | null }, now: number): boolean {
  if (s.status !== 'ended' || !s.actual_end) return false;
  const t = Date.parse(s.actual_end);
  return Number.isFinite(t) && now - t <= RECENT_WINDOW_HOURS * HOUR_MS && t <= now + HOUR_MS;
}
