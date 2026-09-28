// youtube_live_status 共享表（2026-09-28 裁定：週表 Light 排程與 live-og 端點合併成一套）。
// 欄位語意沿用 functions/api/youtube-channel-live-og.js 的 toLiveStatusRow：
//   is_live / is_upcoming（不含常駐框）/ is_schedule_frame / video_id / channel_title / scheduled_start_at / checked_at
// 前端 liveStatusRepository.ts 讀這張表，checked_at 3 分鐘內就直接採用。

import type { Db } from './db.ts';
import type { RosterChannel, StreamRecord, StreamRow } from './types.ts';

export interface LiveStatusRow extends Record<string, unknown> {
  channel_id: string;
  is_live: boolean;
  is_upcoming: boolean;
  is_schedule_frame: boolean;
  video_id: string | null;
  scheduled_start_at: string | null;
  checked_at: string;
}

/**
 * 由頻道目前的場次推出共享表的一列。優先序：直播中 > 最近的待機室（非常駐框）> 常駐框 > 沒有。
 * streams 的 channel_id 是 vtuber_channels.id，共享表的 channel_id 是 YouTube 的 UC…。
 */
export function buildLiveStatusRow(
  channel: Pick<RosterChannel, 'externalId'>,
  streams: readonly (StreamRow | StreamRecord)[],
  now: number,
): LiveStatusRow {
  const checkedAt = new Date(now).toISOString();
  // channel_title 不在這裡寫：vtuber_channels.display_name 對 YouTube 幾乎都是 null，
  // 帶 null 去 upsert 會把 live-og 端點先前寫進去的官方頻道名清掉。欄位不送，既有值就保留。
  const base: LiveStatusRow = {
    channel_id: channel.externalId,
    is_live: false,
    is_upcoming: false,
    is_schedule_frame: false,
    video_id: null,
    scheduled_start_at: null,
    checked_at: checkedAt,
  };
  const live = streams.find((s) => s.status === 'live');
  if (live) return { ...base, is_live: true, video_id: live.external_id, scheduled_start_at: live.scheduled_start };

  const upcoming = streams
    .filter((s) => s.status === 'scheduled' && !s.is_schedule_frame)
    .sort((a, b) => Date.parse(a.scheduled_start ?? '') - Date.parse(b.scheduled_start ?? ''));
  if (upcoming[0]) {
    return { ...base, is_upcoming: true, video_id: upcoming[0].external_id, scheduled_start_at: upcoming[0].scheduled_start };
  }
  const frame = streams.find((s) => s.status === 'scheduled' && s.is_schedule_frame);
  if (frame) return { ...base, is_schedule_frame: true, video_id: frame.external_id, scheduled_start_at: frame.scheduled_start };
  return base;
}

/** 對一批 YouTube 頻道寫共享表：以 streams 表目前的 scheduled/live 場次為準 */
export async function writeLiveStatus(
  db: Db,
  channels: RosterChannel[],
  pendingByChannel: Map<string, (StreamRow | StreamRecord)[]>,
  now: number,
): Promise<number> {
  const rows = channels
    .filter((c) => c.platform === 'youtube' && /^UC[a-zA-Z0-9_-]{22}$/.test(c.externalId))
    .map((c) => buildLiveStatusRow(c, pendingByChannel.get(c.channelId) ?? [], now));
  if (rows.length === 0) return 0;
  await db.upsert('youtube_live_status', rows, 'channel_id');
  return rows.length;
}
