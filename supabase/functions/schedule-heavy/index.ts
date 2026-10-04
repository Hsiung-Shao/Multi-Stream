// schedule-heavy：全量整理，分片執行。
//
// Edge Function 的限制不是牆鐘而是 CPU 時間（本地 soft 1s / hard 2s，正式 2s）：
// 2,525 個頻道的 RSS 用 25 並行 9 秒就抓完，但解析 35,000 個 entry 加上 videos.list 的 JSON 就撞硬上限。
// 所以每次呼叫只處理 cron_shard_state.schedule_heavy_rss.shard_size 個頻道（預設 400），游標繞一圈＝一次全量；
// 正式環境 pg_cron 每小時 :02 呼叫一次（2026-10-04 從每 20 分鐘降頻，20261004120000）；一圈約 7 次呼叫 ≈ 7 小時。
//
// 每次呼叫：
// 1. 游標在 0（新的一圈）時重算名冊分級（T1/T2/T3，排除 graduate）
// 2. 這一片頻道走 RSS 找新影片（整批限流時停手、不懲罰頻道），新影片送 videos.list 分類、寫 streams
// 3. 游標歸零那一片用 videos.list 重查待處理場次（改期、tombstone、常駐框）；直播狀態由 Light 的 live-og 負責
//    API 有每輪與每日上限（rules.ts），資料來源優先序 live-og > RSS > API
// 並寫共享表、last_live_at
// 4. 發布 snapshot
//
// 本地測試：POST http://127.0.0.1:57321/functions/v1/schedule-heavy
//   header: Authorization: Bearer <本地 service_role>（或 x-schedule-secret）
//   ?shard_size=400&budget_ms=60000&concurrency=8&tiers=1 可調

import { loadRoster, recomputeTiers } from '../_shared/roster.ts';
import { writeLiveStatus } from '../_shared/live_status.ts';
import { publishSnapshot } from '../_shared/snapshot.ts';
import {
  applyMerges,
  cancelOrphanTwitchSchedule,
  classifyNewVideos,
  exhausted,
  expireOverdue,
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
import { isLapStart, RSS_FAIL_STREAK_DEAD } from '../_shared/rules.ts';

const JOB = 'schedule_heavy_rss';
const TWITCH_JOB = 'schedule_twitch';
/** Twitch 週表：每頻道一次呼叫、無批次，並行 8 個在 helix 800 點／分內很寬鬆 */
const TWITCH_CONCURRENCY = 8;
const TWITCH_BUDGET_MS = 40_000;
/** 牆鐘預算（RSS 抓取不再開始新頻道的時間點）；真正的限制是 CPU 時間，見檔頭 */
const DEFAULT_BUDGET_MS = 60_000;
/** RSS 並行：25 會讓 YouTube 很快開始限流（2026-09-30 實測），降到 8 */
const DEFAULT_CONCURRENCY = 8;

Deno.serve((req) => {
  const stats = emptyStats('heavy', Date.now());
  return runJob(req, 'heavy', JOB, async (ctx) => {
    const { db, yt, params, now } = ctx;
    const budgetMs = Number(params.get('budget_ms')) || DEFAULT_BUDGET_MS;
    const concurrency = Number(params.get('concurrency')) || DEFAULT_CONCURRENCY;
    const deadline = { at: now + budgetMs };

    // 1. 名冊；新的一圈或 ?tiers=1 時重算分級
    const roster = await loadRoster(db, 'youtube');
    roster.sort((a, b) => (a.channelId < b.channelId ? -1 : 1));
    stats.channels_total = roster.length;
    const shard = await loadShard(db, JOB);
    const shardSize = Number(params.get('shard_size')) || shard.shard_size;
    const start = roster.length ? shard.cursor_position % roster.length : 0;
    // 新的一圈＝這一片跨過名冊開頭（isLapStart；游標繞回時通常不是 0）。上一輪已經是新一圈、這輪還在同一片
    // （RSS 限流沒前進、或跨界那片只做了一部分）就不是：不重算分級、不復活死頻道、不重查待處理（否則每輪重做、吃掉 API 額度）
    const prev = shard.last_run_stats;
    const newLap = isLapStart(start, shardSize, roster.length, prev);
    stats.cursor_start = start;
    stats.new_lap = newLap;
    if (newLap || params.get('tiers') === '1') {
      // 死頻道每圈再試一次：streak 歸零，這一圈若還是失敗（非限流輪次）會再累積
      await db.update('schedule_channel_state', `rss_fail_streak=gte.${RSS_FAIL_STREAK_DEAD}`, { rss_fail_streak: 0 });
      const tiers = await recomputeTiers(db, roster, now);
      (stats as Record<string, unknown>).tiers = tiers.counts;
      (stats as Record<string, unknown>).metric_date = tiers.latestMetricDate;
    }

    // 2. 這一片頻道走 RSS
    const slice = [...roster.slice(start), ...roster.slice(0, start)].slice(0, shardSize);
    const sweep = await rssSweep(slice, { concurrency, deadline, stats, now });
    stats.channels_processed = sweep.processed.length;
    stats.budget_exhausted = exhausted(deadline);
    await writeChannelStates(db, sweep.stateUpdates);
    // 游標只前進到「從頭連續處理完」的位置（限流時失敗的頻道下一輪再試）
    const nextCursor = (start + sweep.advance) % Math.max(roster.length, 1);
    stats.cursor_advance = sweep.advance;

    // 3. 新影片分類（API 有上限；出錯只記錯誤，游標照樣前進、snapshot 照樣發布）
    await softStep(stats, 'classify', async () => {
      await classifyNewVideos(db, yt, sweep.candidates, stats, now);
    });

    // 4. 重查待處理 + 規則（API，只在游標歸零那一片：改期、tombstone、常駐框、沒有排定時間的待機室）。
    //    直播中與 2 小時內的待機室由 Light 的 live-og 負責；API 有每輪與每日上限，超過的留到下一圈
    await expireOverdue(db, stats, now);
    // all 與 frames 合併後依 fetched_at 由舊到新：最久沒查的先查，常駐框也輪得到
    const pending =
      newLap
        ? [...(await loadPendingYouTube(db, now, 'all')), ...(await loadPendingYouTube(db, now, 'frames'))].sort((a, b) => a.fetched_at.localeCompare(b.fetched_at))
        : [];
    let refreshed: Awaited<ReturnType<typeof refreshPending>> = [];
    await softStep(stats, 'refresh', async () => {
      refreshed = await refreshPending(db, yt, pending, stats, now);
    });
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
      // 跨過名冊開頭的那一片清離開名冊的預告（游標繞回時通常不是 0；清除可重複執行，同一圈做兩次也無妨）
      if (tStart === 0 || tStart + tSize > twitchRoster.length) await cancelOrphanTwitchSchedule(db, new Set(twitchRoster.map((c) => c.channelId)), stats, now);
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
    if (newLap) {
      await softStep(stats, 'indexable', async () => {
        stats.indexable_changed = (await db.rpc<number>('refresh_schedule_indexable')) ?? 0;
      });
    }

    // 5. snapshot
    stats.snapshot_bytes = await publishSnapshot(db, now, new Date(now).toISOString());

    return { cursor_position: nextCursor, total_items: roster.length };
  }, stats);
});
