// schedule-heavy：全量整理，分片執行。
//
// Edge Function 的限制不是牆鐘而是 CPU 時間（本地 soft 1s / hard 2s，正式 2s）：
// 2,525 個頻道的 RSS 用 25 並行 9 秒就抓完，但解析 35,000 個 entry 加上 videos.list 的 JSON 就撞硬上限。
// 所以每次呼叫只處理 cron_shard_state.schedule_heavy_rss.shard_size 個頻道（預設 400），游標繞一圈＝一次全量；
// 正式環境用 pg_cron 每隔幾分鐘呼叫一次即可（一圈約 7 次呼叫）。
//
// 每次呼叫：
// 1. 游標在 0（新的一圈）時重算名冊分級（T1/T2/T3，排除 graduate）
// 2. 這一片頻道走 RSS 找新影片，送 videos.list 分類、寫 streams
// 3. 重查 scheduled/live 場次（tombstone / expired）、共享表、last_live_at
// 4. 發布 snapshot
//
// 本地測試：POST http://127.0.0.1:57321/functions/v1/schedule-heavy
//   header: Authorization: Bearer <本地 service_role>（或 x-schedule-secret）
//   ?shard_size=400&budget_ms=60000&concurrency=25&tiers=1 可調

import { loadRoster, recomputeTiers } from '../_shared/roster.ts';
import { writeLiveStatus } from '../_shared/live_status.ts';
import { publishSnapshot } from '../_shared/snapshot.ts';
import {
  applyMerges,
  cancelOrphanTwitchSchedule,
  classifyNewVideos,
  exhausted,
  loadCurrentByChannel,
  loadPendingYouTube,
  refreshPending,
  rssSweep,
  softStep,
  syncTwitchSchedule,
  touchLastLiveAt,
  writeChannelStates,
} from '../_shared/sweep.ts';
import { loadShard, runJob, saveShard } from '../_shared/run.ts';
import { emptyStats } from '../_shared/types.ts';
import { RSS_FAIL_STREAK_DEAD, RSS_FAIL_STREAK_FOR_FALLBACK } from '../_shared/rules.ts';

const JOB = 'schedule_heavy_rss';
const TWITCH_JOB = 'schedule_twitch';
/** Twitch 週表：每頻道一次呼叫、無批次，並行 8 個在 helix 800 點／分內很寬鬆 */
const TWITCH_CONCURRENCY = 8;
const TWITCH_BUDGET_MS = 40_000;
/** 牆鐘預算（RSS 抓取不再開始新頻道的時間點）；真正的限制是 CPU 時間，見檔頭 */
const DEFAULT_BUDGET_MS = 60_000;
const DEFAULT_CONCURRENCY = 25;

Deno.serve((req) => {
  const stats = emptyStats('heavy', Date.now());
  return runJob(req, 'heavy', JOB, async (ctx) => {
    const { db, yt, params, now } = ctx;
    const budgetMs = Number(params.get('budget_ms')) || DEFAULT_BUDGET_MS;
    const concurrency = Number(params.get('concurrency')) || DEFAULT_CONCURRENCY;
    const deadline = { at: now + budgetMs };

    // 1. 名冊；游標在 0（新的一圈）或 ?tiers=1 時重算分級
    const roster = await loadRoster(db, 'youtube');
    roster.sort((a, b) => (a.channelId < b.channelId ? -1 : 1));
    stats.channels_total = roster.length;
    const shard = await loadShard(db, JOB);
    const shardSize = Number(params.get('shard_size')) || shard.shard_size;
    const start = roster.length ? shard.cursor_position % roster.length : 0;
    if (start === 0 || params.get('tiers') === '1') {
      // 死頻道每圈再試一次：streak 降回備援門檻（3），這一圈若還是失敗會再累積回 10
      await db.update('schedule_channel_state', `rss_fail_streak=gte.${RSS_FAIL_STREAK_DEAD}`, { rss_fail_streak: RSS_FAIL_STREAK_FOR_FALLBACK });
      const tiers = await recomputeTiers(db, roster, now);
      (stats as Record<string, unknown>).tiers = tiers.counts;
      (stats as Record<string, unknown>).metric_date = tiers.latestMetricDate;
    }

    // 2. 這一片頻道走 RSS
    const slice = [...roster.slice(start), ...roster.slice(0, start)].slice(0, shardSize);
    const sweep = await rssSweep(slice, yt, { concurrency, deadline, stats, now });
    stats.channels_processed = sweep.processed.length;
    stats.budget_exhausted = exhausted(deadline);
    await writeChannelStates(db, sweep.stateUpdates);
    const nextCursor = (start + sweep.processed.length) % Math.max(roster.length, 1);

    // 3. 新影片分類
    await classifyNewVideos(db, yt, sweep.candidates, stats, now);

    // 4. 重查待處理 + 規則
    // 每一片：所有非常駐框的待處理場次；游標歸零那一片再把常駐框也查一次
    const pending = await loadPendingYouTube(db, now, 'all');
    if (start === 0) pending.push(...(await loadPendingYouTube(db, now, 'frames')));
    const refreshed = await refreshPending(db, yt, pending, stats, now);
    const liveVtubers = refreshed.filter((s) => s.status === 'live').map((s) => s.vtuber_id);
    await touchLastLiveAt(db, liveVtubers, stats, now);

    // 4b. 共享表：這輪 RSS 掃到的頻道 + 有重查場次的頻道；場次狀態從資料庫讀目前所有 scheduled/live
    const touched = new Map(sweep.processed.map((c) => [c.channelId, c]));
    const refreshedChannels = new Set(refreshed.map((s) => s.channel_id));
    for (const c of roster) if (refreshedChannels.has(c.channelId)) touched.set(c.channelId, c);
    const byChannel = await loadCurrentByChannel(db, [...touched.keys()]);
    stats.live_status_rows = await writeLiveStatus(db, [...touched.values()], byChannel, now);

    // 4c～4d 是附加功能：任何一步失敗只記進 stats.errors，不能擋住 RSS 游標前進與 snapshot 發布
    // 4c. Twitch 週表（階段 2）：另一個游標，每片一批頻道；/helix/schedule 一次只能查一個頻道
    await softStep(stats, 'twitch schedule', async () => {
      const twitchRoster = (await loadRoster(db, 'twitch')).sort((a, b) => (a.channelId < b.channelId ? -1 : 1));
      const tShard = await loadShard(db, TWITCH_JOB);
      const tSize = Number(params.get('twitch_size')) || tShard.shard_size;
      const tStart = twitchRoster.length ? tShard.cursor_position % twitchRoster.length : 0;
      if (tStart === 0) await cancelOrphanTwitchSchedule(db, new Set(twitchRoster.map((c) => c.channelId)), stats, now);
      const tSlice = [...twitchRoster.slice(tStart), ...twitchRoster.slice(0, tStart)].slice(0, tSize);
      const tResult = await syncTwitchSchedule(db, ctx.twitch, tSlice, {
        concurrency: TWITCH_CONCURRENCY,
        deadline: { at: Date.now() + TWITCH_BUDGET_MS },
        stats,
        now,
      });
      stats.twitch_schedule_channels = tResult.processed;
      await saveShard(db, TWITCH_JOB, {
        cursor_position: (tStart + tResult.advance) % Math.max(twitchRoster.length, 1),
        total_items: twitchRoster.length,
        stats: { ...stats, finished_at: new Date().toISOString() },
      });
    });

    // 4d. 雙平台合併；游標歸零那一片更新個人頁的可索引旗標
    await softStep(stats, 'merge', () => applyMerges(db, stats, now));
    if (start === 0) {
      await softStep(stats, 'indexable', async () => {
        stats.indexable_changed = (await db.rpc<number>('refresh_schedule_indexable')) ?? 0;
      });
    }

    // 5. snapshot
    stats.snapshot_bytes = await publishSnapshot(db, now, new Date(now).toISOString());

    return { cursor_position: nextCursor, total_items: roster.length };
  }, stats);
});
