// 名冊：從 vtuber_channels（＋vtubers.activity）載入排程要看的頻道，並用 metrics 切面算分級。

import type { Db } from './db.ts';
import { inList, rowsFromColumnar } from './db.ts';
import { computeTier, type Tier } from './rules.ts';
import type { RosterChannel } from './types.ts';

/** schedule_roster／schedule_roster_v2 的一列（頻道＋狀態；沒有狀態列的新頻道 state 欄位為 null；v2 不帶 platform、display_name） */
interface RosterRow {
  id: string;
  vtuber_id: string;
  platform?: 'youtube' | 'twitch';
  external_id: string;
  display_name?: string | null;
  tier?: number | null;
  rss_fail_streak?: number | null;
  last_new_video_at?: string | null;
  og_checked_at?: string | null;
  og_miss_streak?: number | null;
}

interface MetricRow {
  channel_id: string;
  metric_date: string;
  video_count: number | null;
}

function toChannel(r: RosterRow, platform?: 'youtube' | 'twitch'): RosterChannel {
  return {
    channelId: r.id,
    vtuberId: r.vtuber_id,
    platform: (r.platform ?? platform) as 'youtube' | 'twitch',
    externalId: r.external_id,
    displayName: r.display_name ?? null,
    tier: r.tier == null ? null : (r.tier as Tier),
    rssFailStreak: r.rss_fail_streak ?? 0,
    ogCheckedAt: r.og_checked_at ?? null,
    ogMissStreak: r.og_miss_streak ?? 0,
    lastNewVideoAt: r.last_new_video_at ?? null,
  };
}

/**
 * 全部 active、非 graduate、有 external_id 的頻道（依 id 排序）。
 * 資料庫端 RPC 一次回傳名冊＋頻道狀態（json_agg 單一值，不受 PostgREST max-rows 截斷）。
 * 排程三支改用 loadRosterSlice（只取需要的頻道、欄式輸出）；這支保留給需要全名冊的呼叫端。
 * RPC 回 null 一律丟錯：空名冊會被當成「沒有頻道」（例如 Twitch 清孤兒預告會把全部預告取消）。
 */
export async function loadRoster(db: Db, platform?: 'youtube' | 'twitch'): Promise<RosterChannel[]> {
  const rows = await db.rpc<RosterRow[]>('schedule_roster', { p_platform: platform ?? null });
  if (rows == null) throw new Error('schedule_roster 回傳空值');
  return rows.map((r) => toChannel(r, platform));
}

export interface RosterSlice {
  /** 篩選後（分片前）的總數 */
  total: number;
  /** 分片實際起點（offset mod total） */
  start: number;
  channels: RosterChannel[];
}

/**
 * 依用途只取需要的頻道（schedule_roster_v2，欄式輸出）：
 *   - tier：只要這個分級（Light 的 RSS 只掃 T1）
 *   - channelIds：只要這些頻道（Live 只查 2 小時內有場次的頻道）
 *   - offset／limit：游標分片——依 id 排序後從 offset mod total 開始、繞回開頭取 limit 筆
 *     （與原本 [...roster.slice(start), ...roster.slice(0, start)].slice(0, size) 相同），total／start 一併回傳
 * 出口流量：原本每輪讀全名冊（約 1MB），light 一天 144 輪、live 72 輪是最大宗。
 */
export async function loadRosterSlice(
  db: Db,
  opts: { platform: 'youtube' | 'twitch'; tier?: Tier; channelIds?: readonly string[]; offset?: number; limit?: number },
): Promise<RosterSlice> {
  const res = await db.rpc<unknown>('schedule_roster_v2', {
    p_platform: opts.platform,
    p_tier: opts.tier ?? null,
    p_channel_ids: opts.channelIds ? [...opts.channelIds] : null,
    p_offset: opts.offset ?? null,
    p_limit: opts.limit ?? null,
  });
  if (res == null) throw new Error('schedule_roster_v2 回傳空值');
  const channels = rowsFromColumnar<RosterRow>(res).map((r) => toChannel(r, opts.platform));
  const meta = Array.isArray(res) ? null : (res as { total?: number; start?: number });
  return { total: meta?.total ?? channels.length, start: meta?.start ?? 0, channels };
}

/**
 * 重算 YouTube 頻道分級並寫回 schedule_channel_state（只寫 tier 相關欄位，RSS 健康度欄位不動）。
 * last_new_video_at 取自名冊（loadRoster 同一次 RPC 帶回）。
 * 切面：metrics 最新一天、不晚於 30 天前的最近一天、不晚於 90 天前的最近一天。
 */
export async function recomputeTiers(
  db: Db,
  channels: RosterChannel[],
  now: number,
): Promise<{ counts: Record<Tier, number>; latestMetricDate: string | null }> {
  const yt = channels.filter((c) => c.platform === 'youtube');
  const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
  if (yt.length === 0) return { counts, latestMetricDate: null };

  const dates = await pickMetricDates(db, now);
  const metrics = new Map<string, Map<string, number | null>>(); // channel → date → video_count
  if (dates.length) {
    const rows = await db.selectAll<MetricRow>(
      'vtuber_channel_metrics_daily',
      `select=channel_id,metric_date,video_count&metric_date=${inList(dates)}`,
    );
    for (const r of rows) {
      let m = metrics.get(r.channel_id);
      if (!m) metrics.set(r.channel_id, (m = new Map()));
      m.set(r.metric_date, r.video_count);
    }
  }
  const [dNow, d30, d90] = dates;

  const activity = await db.selectAll<{ id: string; activity: string }>('vtubers', 'select=id,activity');
  const activityMap = new Map(activity.map((v) => [v.id, v.activity]));

  const upserts: Record<string, unknown>[] = [];
  const nowIso = new Date(now).toISOString();
  for (const c of yt) {
    const m = metrics.get(c.channelId);
    const result = computeTier(
      {
        activity: activityMap.get(c.vtuberId) ?? 'active',
        videoCountNow: dNow ? (m?.get(dNow) ?? null) : null,
        videoCount30: d30 ? (m?.get(d30) ?? null) : null,
        videoCount90: d90 ? (m?.get(d90) ?? null) : null,
        lastNewVideoAt: c.lastNewVideoAt ?? null, // 名冊已帶回（loadRoster），不再重讀 schedule_channel_state
      },
      now,
    );
    if (!result) continue;
    counts[result.tier] += 1;
    c.tier = result.tier;
    upserts.push({ channel_id: c.channelId, tier: result.tier, tier_reason: result.reason, tier_updated_at: nowIso });
  }
  await db.upsert('schedule_channel_state', upserts, 'channel_id');
  return { counts, latestMetricDate: dNow ?? null };
}

async function pickMetricDates(db: Db, now: number): Promise<string[]> {
  const latest = await db.select<{ metric_date: string }>(
    'vtuber_channel_metrics_daily',
    'select=metric_date&order=metric_date.desc&limit=1',
  );
  if (!latest[0]) return [];
  const pick = async (daysAgo: number): Promise<string | null> => {
    const target = new Date(now - daysAgo * 86_400_000).toISOString().slice(0, 10);
    const rows = await db.select<{ metric_date: string }>(
      'vtuber_channel_metrics_daily',
      `select=metric_date&metric_date=lte.${target}&order=metric_date.desc&limit=1`,
    );
    return rows[0]?.metric_date ?? null;
  };
  const d30 = await pick(30);
  const d90 = await pick(90);
  // 三個切面可能重疊（資料不夠久）；用陣列位置表達語意，重複的日期只查一次
  return [latest[0].metric_date, d30 ?? latest[0].metric_date, d90 ?? d30 ?? latest[0].metric_date];
}
