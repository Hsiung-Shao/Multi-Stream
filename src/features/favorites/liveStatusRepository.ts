// YouTube 直播狀態共享表 youtube_live_status 的前端讀取（路線圖階段 1，2026-09）。
//
// 第一個使用者透過 /api/youtube-channel-live-og 查到的結果由端點以 service_role 寫進共享表；
// 其他使用者先批次讀這張表，資料夠新就直接用，完全不經過 Workers。前端對這張表只有 SELECT 權限。
// 讀取失敗（網路、Supabase 未設定、逾時）一律回空結果，呼叫端會退回打端點，功能不受影響。

import { getSupabase } from '../../lib/supabase';

/**
 * 共享表的資料多新可以直接用。2026-10-04 從 3 分鐘放寬到 12 分鐘：共享表主要由週表排程（schedule-live，約每 10 分鐘）
 * 寫入，3 分鐘的門檻讓多數頻道被判「太舊」而改打端點，收藏多的使用者每 2 秒打一次，Pages 24 小時 8,028 次 CPU 超限。
 * 12 分鐘仍短於離線頻道的節流（15 分鐘），開台偵測的延遲上限不變。
 */
export const LIVE_STATUS_FRESH_MS = 12 * 60 * 1000;

/** 使用者手動重新整理時的門檻：與 live-og 端點的 edge 快取 TTL 相同，比這更新的資料打端點也只會拿到同一份 */
export const LIVE_STATUS_FRESH_FORCE_MS = 3 * 60 * 1000;

// `in.(...)` 的值放在 URL 裡；每個 channelId 24 字元，100 個約 2.5KB，留足 URL 長度餘裕
const CHUNK_SIZE = 100;
// client fetch 一律要有逾時（memory error_client_fetch_needs_timeout）
const TIMEOUT_MS = 8000;

const COLUMNS = 'channel_id,is_live,is_upcoming,is_schedule_frame,video_id,channel_title,scheduled_start_at,checked_at';

export interface LiveStatusRow {
    channel_id: string;
    is_live: boolean;
    is_upcoming: boolean;
    is_schedule_frame: boolean;
    video_id: string | null;
    channel_title: string | null;
    scheduled_start_at: string | null;
    checked_at: string;
}

/** 與 youtubeApi.checkChannelLiveStatus 的回傳同形，呼叫端不需要分辨資料來源 */
export interface LiveStatusResult {
    isLive: boolean;
    liveVideoId?: string;
    finalUrl?: string;
    isUpcoming?: boolean;
    scheduledStartTime?: string;
    channelTitle?: string;
}

/**
 * 資料是否夠新。使用者電腦時鐘可能有偏差：比伺服器慢時 checked_at 會落在「未來」，
 * 在同一個視窗內也視為新鮮；偏差超過視窗就當作過期，退回打端點（edge 快取會接住）。
 */
export function isLiveStatusFresh(row: Pick<LiveStatusRow, 'checked_at'>, now = Date.now(), maxAgeMs = LIVE_STATUS_FRESH_MS): boolean {
    const checkedAt = Date.parse(row.checked_at);
    if (!Number.isFinite(checkedAt)) return false;
    const age = now - checkedAt;
    return age < maxAgeMs && age > -maxAgeMs;
}

/** 共享表的一列 → 與端點回應同形的結果（對齊 youtubeApi 對端點 JSON 的轉換） */
export function toLiveStatusResult(row: LiveStatusRow): LiveStatusResult {
    const scheduled = row.scheduled_start_at ? Date.parse(row.scheduled_start_at) : NaN;
    return {
        isLive: row.is_live,
        liveVideoId: row.video_id ?? undefined,
        finalUrl: row.video_id ? `https://www.youtube.com/watch?v=${row.video_id}` : undefined,
        isUpcoming: row.is_upcoming,
        scheduledStartTime: Number.isFinite(scheduled) ? String(Math.floor(scheduled / 1000)) : undefined,
        channelTitle: row.channel_title ?? undefined,
    };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([promise, new Promise<null>(resolve => setTimeout(() => resolve(null), ms))]);
}

/** 批次讀取共享表；回傳 channelId → 列。任何失敗都回空（或部分）結果，不丟錯 */
export async function fetchLiveStatuses(channelIds: string[]): Promise<Map<string, LiveStatusRow>> {
    const result = new Map<string, LiveStatusRow>();
    const ids = [...new Set(channelIds.filter(Boolean))];
    if (ids.length === 0) return result;

    const supabase = await withTimeout(getSupabase(), TIMEOUT_MS);
    if (!supabase) return result;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const { data, error } = await supabase
                .from('youtube_live_status')
                .select(COLUMNS)
                .in('channel_id', chunk)
                .abortSignal(controller.signal);
            if (!error && Array.isArray(data)) {
                for (const row of data as LiveStatusRow[]) result.set(row.channel_id, row);
            }
        } catch {
            // 這一批讀不到：呼叫端會對這些頻道退回打端點
        } finally {
            clearTimeout(timer);
        }
    }
    return result;
}
