// schedule-live：每 20 分鐘（:00、:20、:40；2026-10-04 從每 10 分鐘降頻，20261004120000）。YouTube 直播狀態（live-og，不耗 API 配額）。
// 2026-10-02 從 schedule-light 拆出來：RSS 與 live-og 在同一次呼叫時 CPU 會超過 Edge Function 的 2 秒上限（546）。
//
// 1. 過期：排定時間過後 3 小時仍未開始的待機室 → expired（資料庫端）
// 2. live-og：直播中（30 分鐘內查過的跳過）或 2 小時內待機室的頻道抓 /live 頁 → 開播、結束（連續兩輪確認）、改期
// 3. 雙平台合併、vtubers.last_live_at、youtube_live_status 共享表（這輪查到的頻道）
// 4. 發布 snapshot
//
// 本地測試：POST http://127.0.0.1:57321/functions/v1/schedule-live（header 同 heavy）
//   ?og_max=80&budget_ms=40000 可調

import { loadRosterSlice } from '../_shared/roster.ts';
import { writeLiveStatus } from '../_shared/live_status.ts';
import { publishSnapshot } from '../_shared/snapshot.ts';
import { applyMerges, expireOverdue, loadPendingYouTube, ogSweep, softStep, touchLastLiveAt } from '../_shared/sweep.ts';
import { loadShard, runJob } from '../_shared/run.ts';
import { emptyStats } from '../_shared/types.ts';

/** 統計寫在這一列（cron_shard_state，20261002100000 建立）；這支沒有游標 */
const JOB = 'schedule_live_og';
const HEAVY_JOB = 'schedule_heavy_rss';
/**
 * live-og：/live 頁串流讀取（live_og.ts），並行 6。
 * 2026-10-02 本地 edge runtime 實測（只跑 live-og＋固定成本）：60、80、100 各兩輪都越過 1 秒 soft limit、
 * 未達 2 秒 hard limit；固定成本（名冊、合併、snapshot）單獨跑不到 1 秒。取 80 留餘裕（正式環境 CPU 速度不同）。
 * 直播中的頻道 30 分鐘內查過就跳過（OG_LIVE_RECHECK_MS，2026-10-08 從 1 小時縮短；等下播確認的例外），約隔一輪查一次，
 * 高峰（約 220 個直播中）每輪約 110 個到期，加上保留給待機室的 20 個名額會超過 80 → 部分頻道順延一輪（最久沒查的先查）。
 */
const OG_CONCURRENCY = 6;
const OG_MAX_CHANNELS = 80;
const OG_BUDGET_MS = 40_000;

Deno.serve((req) => {
  const stats = emptyStats('live', Date.now());
  return runJob(req, 'live', JOB, async (ctx) => {
    const { db, params, now } = ctx;
    // 1. 過期（資料庫端，每輪都跑），再用 live-og 查直播中或 2 小時內待機室的頻道（直播中的優先、最久沒查的先查）
    await expireOverdue(db, stats, now);
    const near = await loadPendingYouTube(db, now, 'near');
    const nearChannels = new Set(near.map((s) => s.channel_id));
    const liveFirst = new Set(near.filter((s) => s.status === 'live').map((s) => s.channel_id));
    stats.channels_total = nearChannels.size;
    // 名冊只取這些頻道（schedule_roster_v2；原本每輪讀全部 YouTube 名冊再過濾）
    const youtube = nearChannels.size ? (await loadRosterSlice(db, { platform: 'youtube', channelIds: [...nearChannels] })).channels : [];
    const og = await ogSweep(db, youtube, stats, now, {
      concurrency: OG_CONCURRENCY,
      deadline: { at: Date.now() + (Number(params.get('budget_ms')) || OG_BUDGET_MS) },
      maxChannels: Number(params.get('og_max')) || OG_MAX_CHANNELS,
      liveFirst,
    });
    stats.channels_processed = og.checked.length;

    // 2. 合併（直播狀態剛變）、last_live_at、共享表（這輪查到的頻道）
    await softStep(stats, 'merge', () => applyMerges(db, stats, now));
    await touchLastLiveAt(db, og.liveVtuberIds, stats, now);
    // 這輪查到的頻道寫入後的現況由 ogSweep 帶回（寫入前已讀過一次，不再重查 streams）
    stats.live_status_rows = await writeLiveStatus(db, og.checked, og.current, now);

    // 3. snapshot（heavy_refreshed_at 取 Heavy 最後成功時間）
    const heavy = await loadShard(db, HEAVY_JOB);
    stats.snapshot_bytes = await publishSnapshot(db, now, heavy.last_run_at);
    // 0＝指紋沒變、這輪沒有重組上傳（schedule_snapshot_check），記在 stats.snapshot_skipped
    stats.snapshot_skipped = stats.snapshot_bytes === 0;

    return {};
  }, stats);
});
