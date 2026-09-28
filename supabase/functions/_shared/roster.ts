// 名冊：從 vtuber_channels（＋vtubers.activity）載入排程要看的頻道，並用 metrics 切面算分級。

import type { Db } from './db.ts';
import { inList } from './db.ts';
import { computeTier, type Tier } from './rules.ts';
import type { RosterChannel } from './types.ts';

interface ChannelRow {
  id: string;
  vtuber_id: string;
  platform: 'youtube' | 'twitch';
  external_id: string;
  display_name: string | null;
  vtubers: { activity: string } | null;
}

interface StateRow {
  channel_id: string;
  tier: number;
  rss_fail_streak: number;
  last_new_video_at: string | null;
}

interface MetricRow {
  channel_id: string;
  metric_date: string;
  video_count: number | null;
}

const ROSTER_QUERY =
  'select=id,vtuber_id,platform,external_id,display_name,vtubers!inner(activity)' +
  '&status=eq.active&external_id=not.is.null&vtubers.activity=neq.graduate';

/** 全部 active、非 graduate、有 external_id 的頻道 */
export async function loadRoster(db: Db, platform?: 'youtube' | 'twitch'): Promise<RosterChannel[]> {
  const q = platform ? `${ROSTER_QUERY}&platform=eq.${platform}` : ROSTER_QUERY;
  const rows = await db.selectAll<ChannelRow>('vtuber_channels', q);
  const states = await db.selectAll<StateRow>(
    'schedule_channel_state',
    'select=channel_id,tier,rss_fail_streak,last_new_video_at',
    'channel_id',
  );
  const stateMap = new Map(states.map((s) => [s.channel_id, s]));
  return rows.map((r) => {
    const s = stateMap.get(r.id);
    return {
      channelId: r.id,
      vtuberId: r.vtuber_id,
      platform: r.platform,
      externalId: r.external_id,
      displayName: r.display_name,
      tier: s ? (s.tier as Tier) : null,
      rssFailStreak: s?.rss_fail_streak ?? 0,
    };
  });
}

/**
 * 重算 YouTube 頻道分級並寫回 schedule_channel_state（只寫 tier 相關欄位，RSS 健康度欄位不動）。
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
  const states = await db.selectAll<StateRow>(
    'schedule_channel_state',
    'select=channel_id,tier,rss_fail_streak,last_new_video_at',
    'channel_id',
  );
  const lastNew = new Map(states.map((s) => [s.channel_id, s.last_new_video_at]));

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
        lastNewVideoAt: lastNew.get(c.channelId) ?? null,
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
