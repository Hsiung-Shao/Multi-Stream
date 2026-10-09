// schedule-light：每 10 分鐘（:05、:15…）。資料來源優先序 live-og > RSS > API（2026-09-30 使用者裁定，見 rules.ts）。
// 直播狀態（live-og）拆到 schedule-live（2026-10-02）：兩邊合在一次呼叫時 CPU 會超過 Edge Function 的 2 秒上限。
//
// 1. T1 頻道分片走 RSS 找新影片（游標存 cron_shard_state.schedule_light_rss）；整批限流時停手、不懲罰頻道
// 2. RSS 新發現的影片送 videos.list 分類（有呼叫上限，超過的下一輪再查）
// 3. Twitch /helix/streams（100 個 user_id／次）：直播中寫 twitch_live，消失的標 ended
// 4. 雙平台合併、vtubers.last_live_at、youtube_live_status 共享表（這輪 RSS 掃到的頻道）
// 5. 發布 snapshot
//
// CPU（2026-10-02 本地 edge runtime 實測）：固定成本（名冊、Twitch、合併、snapshot）＋RSS 500 約 1 秒；
// 同一次再加 live-og 100 頁會撞 2 秒 hard limit（546），所以拆開。
//
// 本地測試：POST http://127.0.0.1:57321/functions/v1/schedule-light（header 同 heavy）
//   ?shard_size=500&concurrency=8&budget_ms=60000 可調

import { loadRosterSlice } from '../_shared/roster.ts';
import { writeLiveStatus } from '../_shared/live_status.ts';
import { publishSnapshot } from '../_shared/snapshot.ts';
import { applyMerges, classifyNewVideos, exhausted, loadCurrentByChannelRpc, rssSweep, softStep, syncTwitchLive, touchLastLiveAt, writeChannelStates } from '../_shared/sweep.ts';
import { loadShard, runJob } from '../_shared/run.ts';
import { emptyStats } from '../_shared/types.ts';

const JOB = 'schedule_light_rss';
const HEAVY_JOB = 'schedule_heavy_rss';
const DEFAULT_BUDGET_MS = 60_000;
/** RSS 並行：25 會讓 YouTube 很快開始限流（2026-09-30 實測），降到 8 */
const DEFAULT_CONCURRENCY = 8;

Deno.serve((req) => {
  const stats = emptyStats('light', Date.now());
  return runJob(req, 'light', JOB, async (ctx) => {
    const { db, yt, twitch, params, now } = ctx;
    const budgetMs = Number(params.get('budget_ms')) || DEFAULT_BUDGET_MS;
    const concurrency = Number(params.get('concurrency')) || DEFAULT_CONCURRENCY;
    const deadline = { at: now + budgetMs };

    // 1. T1 分片 RSS：名冊只取這一片 T1（schedule_roster_v2 在資料庫端依 id 排序、從游標繞回取 shard_size 筆，回傳 T1 總數）
    const shard = await loadShard(db, JOB);
    const shardSize = Number(params.get('shard_size')) || shard.shard_size;
    const t1 = await loadRosterSlice(db, { platform: 'youtube', tier: 1, offset: shard.cursor_position, limit: shardSize });
    const tier1Total = t1.total;
    stats.channels_total = tier1Total;
    const start = t1.start;
    const slice = t1.channels;
    const sweep = await rssSweep(slice, { concurrency, deadline, stats, now });
    stats.channels_processed = sweep.processed.length;
    stats.budget_exhausted = exhausted(deadline);
    await writeChannelStates(db, sweep.stateUpdates);
    // 游標只前進到「從頭連續處理完」的位置（限流時失敗的頻道下一輪再試）
    const nextCursor = (start + sweep.advance) % Math.max(tier1Total, 1);

    // 2. RSS 新發現的影片（API，有上限）；API 出錯（配額用完、5xx）只記錯誤，不擋住 snapshot。
    //    schedule-live 已寫入的直播／待機室場次在 streams 裡，schedule_unseen_video_ids 會排除，不重花 API
    await softStep(stats, 'classify', async () => {
      await classifyNewVideos(db, yt, sweep.candidates, stats, now);
    });

    // 3. Twitch 直播中（全部 Twitch 頻道；名冊只帶 id、vtuber_id、external_id）
    const twitchChannels = (await loadRosterSlice(db, { platform: 'twitch' })).channels;
    const twitchResult = await syncTwitchLive(db, twitch, twitchChannels, stats, now);
    // 合併是附加功能：失敗只記錯誤，不能擋住後面的共享表與 snapshot
    await softStep(stats, 'merge', () => applyMerges(db, stats, now));

    // 4. last_live_at + 共享表（這輪 RSS 掃到的頻道；場次狀態從資料庫讀「目前所有 scheduled/live」）
    await touchLastLiveAt(db, twitchResult.liveVtuberIds, stats, now);
    const byChannel = await loadCurrentByChannelRpc(db, sweep.processed.map((c) => c.channelId));
    stats.live_status_rows = await writeLiveStatus(db, sweep.processed, byChannel, now);

    // 5. snapshot（heavy_refreshed_at 取 Heavy 最後成功時間）
    const heavy = await loadShard(db, HEAVY_JOB);
    stats.snapshot_bytes = await publishSnapshot(db, now, heavy.last_run_at);
    // 0＝指紋沒變、這輪沒有重組上傳（schedule_snapshot_check），記在 stats.snapshot_skipped
    stats.snapshot_skipped = stats.snapshot_bytes === 0;

    return { cursor_position: nextCursor, total_items: tier1Total };
  }, stats);
});
