// schedule-light：每 5 分鐘。
//
// 1. T1 頻道分片走 RSS（游標存 cron_shard_state.schedule_light_rss），新影片送 videos.list
// 2. 重查所有 scheduled/live 的 YouTube 場次（live / ended / hidden / expired）
// 3. Twitch /helix/streams（100 個 user_id／次）：直播中寫 twitch_live，消失的標 ended
// 4. vtubers.last_live_at、youtube_live_status 共享表
// 5. 發布 snapshot
//
// 本地測試：POST http://127.0.0.1:57321/functions/v1/schedule-light（header 同 heavy）
//   ?shard_size=500&concurrency=25&budget_ms=60000 可調

import { loadRoster } from '../_shared/roster.ts';
import { writeLiveStatus } from '../_shared/live_status.ts';
import { publishSnapshot } from '../_shared/snapshot.ts';
import { classifyNewVideos, exhausted, loadCurrentByChannel, loadPendingYouTube, refreshPending, rssSweep, syncTwitchLive, touchLastLiveAt, writeChannelStates } from '../_shared/sweep.ts';
import { loadShard, runJob } from '../_shared/run.ts';
import { emptyStats } from '../_shared/types.ts';

const JOB = 'schedule_light_rss';
const HEAVY_JOB = 'schedule_heavy_rss';
const DEFAULT_BUDGET_MS = 60_000;
const DEFAULT_CONCURRENCY = 25;

Deno.serve((req) => {
  const stats = emptyStats('light', Date.now());
  return runJob(req, 'light', JOB, async (ctx) => {
    const { db, yt, twitch, params, now } = ctx;
    const budgetMs = Number(params.get('budget_ms')) || DEFAULT_BUDGET_MS;
    const concurrency = Number(params.get('concurrency')) || DEFAULT_CONCURRENCY;
    const deadline = { at: now + budgetMs };

    const roster = await loadRoster(db);
    const youtube = roster.filter((c) => c.platform === 'youtube');
    const twitchChannels = roster.filter((c) => c.platform === 'twitch');
    const tier1 = youtube.filter((c) => c.tier === 1).sort((a, b) => (a.channelId < b.channelId ? -1 : 1));
    stats.channels_total = tier1.length;

    // 1. T1 分片 RSS
    const shard = await loadShard(db, JOB);
    const shardSize = Number(params.get('shard_size')) || shard.shard_size;
    const start = tier1.length ? shard.cursor_position % tier1.length : 0;
    const slice = [...tier1.slice(start), ...tier1.slice(0, start)].slice(0, shardSize);
    const sweep = await rssSweep(slice, yt, { concurrency, deadline, stats, now });
    stats.channels_processed = sweep.processed.length;
    stats.budget_exhausted = exhausted(deadline);
    await writeChannelStates(db, sweep.stateUpdates);
    const nextCursor = (start + sweep.processed.length) % Math.max(tier1.length, 1);
    await classifyNewVideos(db, yt, sweep.candidates, stats, now);

    // 2. 待處理場次
    const pending = await loadPendingYouTube(db, now, 'near');
    const refreshed = await refreshPending(db, yt, pending, stats, now);

    // 3. Twitch 直播中
    const twitchResult = await syncTwitchLive(db, twitch, twitchChannels, stats, now);

    // 4. last_live_at + 共享表
    const liveVtubers = [...refreshed.filter((s) => s.status === 'live').map((s) => s.vtuber_id), ...twitchResult.liveVtuberIds];
    await touchLastLiveAt(db, liveVtubers, stats, now);
    // 共享表：這輪 RSS 掃到的頻道 + 有重查場次的頻道；場次狀態從資料庫讀「目前所有 scheduled/live」，
    // 不能只用 refreshed（near 範圍與本輪剛寫入的場次都不在裡面，會寫出假的「無直播」）
    const touched = new Map(sweep.processed.map((c) => [c.channelId, c]));
    const refreshedChannels = new Set(refreshed.map((s) => s.channel_id));
    for (const c of youtube) if (refreshedChannels.has(c.channelId)) touched.set(c.channelId, c);
    const byChannel = await loadCurrentByChannel(db, [...touched.keys()]);
    stats.live_status_rows = await writeLiveStatus(db, [...touched.values()], byChannel, now);

    // 5. snapshot（heavy_refreshed_at 取 Heavy 最後成功時間）
    const heavy = await loadShard(db, HEAVY_JOB);
    stats.snapshot_bytes = await publishSnapshot(db, now, heavy.last_run_at);

    return { cursor_position: nextCursor, total_items: tier1.length };
  }, stats);
});
