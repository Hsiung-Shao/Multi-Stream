// Heavy / Light 共用的核心流程：
//   1. RSS 掃描（並行、有時間預算），找出資料庫沒看過的影片
//   2. 新影片送 videos.list 分類 → 寫 streams / schedule_seen_videos
//   3. 重查 scheduled / live 的場次（live / ended / hidden）＋ 套用過期規則
//   4. Twitch /helix/streams → twitch_live 場次
//   5. youtube_live_status 共享表、vtubers.last_live_at

import type { Db } from './db.ts';
import { inList } from './db.ts';
import { fetchChannelRss, type RssEntry } from './rss.ts';
import {
  classifyYouTubeVideo,
  EXPIRE_AFTER_HOURS,
  isExpired,
  shouldSkipChannel,
  shouldUseApiFallback,
  TIER1_DAYS,
  UPCOMING_WINDOW_DAYS as UPCOMING_DAYS,
  type StreamStatus,
} from './rules.ts';
import type { YouTubeClient, YouTubeVideo } from './youtube.ts';
import { HelixError, type TwitchClient, type TwitchSchedule } from './twitch.ts';
import { mergeChanges, type MergeInput } from './merge.ts';
import type { RosterChannel, RunStats, StreamRecord, StreamRow } from './types.ts';

export interface Deadline {
  /** epoch ms，超過就停止開始新的工作 */
  at: number;
}

export const exhausted = (d: Deadline, now = Date.now()): boolean => now >= d.at;

/** 有並行上限與時間預算的 map；預算用完就不再開始新的項目，回傳已處理數 */
export async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  deadline: Deadline,
  fn: (item: T) => Promise<void>,
): Promise<number> {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length && !exhausted(deadline)) {
      const item = items[next++];
      await fn(item);
      done += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return done;
}

export interface Candidate {
  channel: RosterChannel;
  entry: RssEntry;
}

export interface SweepResult {
  candidates: Map<string, Candidate>; // videoId → 來源
  processed: RosterChannel[];
  stateUpdates: Record<string, unknown>[]; // schedule_channel_state 的 RSS 健康度
}

const STREAMS_COLS =
  'id,vtuber_id,channel_id,platform,external_id,source,status,scheduled_start,scheduled_end,actual_start,actual_end,title,category,thumbnail_url,viewer_count,is_schedule_frame,fetched_at';

/**
 * RSS 掃描。連續失敗達門檻的頻道改走 playlistItems.list（1 單位／頻道）。
 * 回傳的 candidates 還沒過濾「看過的影片」，由 classifyNewVideos 處理。
 */
export async function rssSweep(
  channels: RosterChannel[],
  yt: YouTubeClient,
  opts: { concurrency: number; deadline: Deadline; fetch?: typeof fetch; stats: RunStats; now: number },
): Promise<SweepResult> {
  const candidates = new Map<string, Candidate>();
  const processed: RosterChannel[] = [];
  const stateUpdates: Record<string, unknown>[] = [];
  const nowIso = new Date(opts.now).toISOString();

  await mapLimit(channels, opts.concurrency, opts.deadline, async (ch) => {
    // 連續失敗太多次（RSS 與 API 備援都失敗，通常是已刪除／停用的頻道）：跳過，不再花配額；
    // Heavy 每一圈開頭會把這些 streak 降回備援門檻再試一次
    if (shouldSkipChannel(ch.rssFailStreak)) {
      opts.stats.rss_skipped_dead += 1;
      processed.push(ch); // 跳過也算「這一片處理過」，游標才會前進
      return;
    }
    let entries: RssEntry[] = [];
    let ok = false;
    let error: string | null = null;
    if (shouldUseApiFallback(ch.rssFailStreak)) {
      try {
        const ids = await yt.listRecentUploads(ch.externalId);
        entries = ids.map((videoId) => ({ videoId, title: '', publishedAt: null, updatedAt: null }));
        ok = true;
        opts.stats.rss_fallback_used += 1;
      } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 200) : 'fallback failed';
      }
    } else {
      const r = await fetchChannelRss(ch.externalId, { fetch: opts.fetch });
      ok = r.ok;
      error = r.error;
      entries = r.entries;
      if (r.status === 429) {
        // YouTube 對單一 IP 的 RSS 限速（本地實測：90 秒內連打 2 萬次會開始回 429）。
        // 這不是頻道的問題：不算 fail streak、不算已處理（游標不越過它），而且這一輪不再開始新的頻道
        opts.stats.rss_rate_limited += 1;
        opts.deadline.at = Date.now();
        stateUpdates.push({ channel_id: ch.channelId, rss_fail_streak: ch.rssFailStreak, rss_last_error: 'http 429', last_checked_at: nowIso });
        return;
      }
    }
    processed.push(ch);
    if (ok) {
      opts.stats.rss_ok += 1;
      opts.stats.rss_entries += entries.length;
      for (const entry of entries) {
        if (!candidates.has(entry.videoId)) candidates.set(entry.videoId, { channel: ch, entry });
      }
      stateUpdates.push({
        channel_id: ch.channelId,
        rss_fail_streak: 0,
        rss_last_ok_at: nowIso,
        rss_last_error: null,
        last_checked_at: nowIso,
      });
    } else {
      opts.stats.rss_failed += 1;
      // 走備援也失敗：計數繼續加，但不會因此永遠不回 RSS —— Heavy 重算分級時只看 tier，
      // 這裡的 streak 只決定下次走不走備援；若備援也失敗，維持走備援（下次再試）
      stateUpdates.push({
        channel_id: ch.channelId,
        rss_fail_streak: ch.rssFailStreak + 1,
        rss_last_error: error,
        last_checked_at: nowIso,
      });
    }
  });

  return { candidates, processed, stateUpdates };
}

/**
 * 寫回 schedule_channel_state 的 RSS 健康度。
 * PostgREST upsert 是 INSERT … ON CONFLICT DO UPDATE：NOT NULL 又沒 DEFAULT 的欄位（tier）即使走 UPDATE 分支
 * 也要出現在 payload 裡（memory error_postgrest_upsert_not_null_and_empty_body），所以先把現有 tier 讀回來一起送；
 * 沒有列的新頻道先當 T2。
 */
export async function writeChannelStates(db: Db, updates: Record<string, unknown>[]): Promise<void> {
  if (updates.length === 0) return;
  const ids = updates.map((u) => String(u.channel_id));
  const tiers = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await db.select<{ channel_id: string; tier: number }>(
      'schedule_channel_state',
      `select=channel_id,tier&channel_id=${inList(ids.slice(i, i + 100))}&limit=100`,
    );
    for (const r of rows) tiers.set(r.channel_id, r.tier);
  }
  const rows = updates.map((u) => {
    const id = String(u.channel_id);
    const known = tiers.get(id);
    const base: Record<string, unknown> = { ...u, tier: known ?? 2 };
    if (known == null) base.tier_reason = 'first_seen';
    return base;
  });
  // 批次 upsert 要求每筆欄位集一致，但不能用「缺的補 null」湊齊：失敗列沒有 rss_last_ok_at，
  // 補 null 會把既有的最後成功時間覆寫掉。改成依欄位集分組，各組各自 upsert。
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const sig = Object.keys(r).sort().join(',');
    const list = groups.get(sig) ?? [];
    list.push(r);
    groups.set(sig, list);
  }
  for (const list of groups.values()) await db.upsert('schedule_channel_state', list, 'channel_id');
}

/**
 * 新影片分類：排除 streams 與 schedule_seen_videos 已有的，其餘送 videos.list。
 * 有 liveStreamingDetails 的寫進 streams；全部寫進 seen（stream / video / missing）。
 * 回傳升級名單（T2/T3 頻道有新影片 → T1）。
 */
export async function classifyNewVideos(
  db: Db,
  yt: YouTubeClient,
  candidates: Map<string, Candidate>,
  stats: RunStats,
  now: number,
): Promise<{ promoted: RosterChannel[]; upserted: StreamRow[] }> {
  const ids = [...candidates.keys()];
  // 「看過的影片」以頻道為單位一次撈（每 100 個頻道一次查詢，自動分頁），
  // 比逐 100 個 videoId 查便宜得多：一輪 RSS 會有上萬個候選 id
  const channelIds = [...new Set([...candidates.values()].map((c) => c.channel.channelId))];
  const known = await loadKnownVideoIds(db, channelIds);
  const fresh = ids.filter((id) => !known.has(id));
  stats.new_video_candidates += fresh.length;
  if (fresh.length === 0) return { promoted: [], upserted: [] };

  const videos = await yt.listVideos(fresh);
  const nowIso = new Date(now).toISOString();
  const seenRows: Record<string, unknown>[] = [];
  const streamRows: StreamRow[] = [];
  const promotedSet = new Map<string, RosterChannel>();
  const latestNew = new Map<string, number>(); // channel → 最近一支 30 天內新影片的發布時間

  for (const id of fresh) {
    const cand = candidates.get(id)!;
    const v = videos.get(id);
    if (!v) {
      seenRows.push({ video_id: id, channel_id: cand.channel.channelId, kind: 'missing', published_at: cand.entry.publishedAt });
      continue;
    }
    const cls = classifyYouTubeVideo(v.facts, now);
    seenRows.push({ video_id: id, channel_id: cand.channel.channelId, kind: cls.kind, published_at: cand.entry.publishedAt });
    // 30 天內發布的新影片（含一般上傳）才算活動：T2/T3 升 T1。
    // 第一次掃描時 RSS 回的是頻道最新 15 支，可能是幾年前的舊片，不能一律當活動
    // 備援路徑沒有 publishedAt，用 actualStart / scheduledStart 代替；未來的時間（常駐框在幾年後）
    // 夾到 now，否則 last_new_video_at 會是未來、頻道永遠 T1
    const publishedAt = cand.entry.publishedAt ?? v.facts.actualStartTime ?? v.facts.scheduledStartTime ?? null;
    const publishedMs = publishedAt ? Math.min(Date.parse(publishedAt), now) : NaN;
    if (Number.isFinite(publishedMs) && now - publishedMs <= TIER1_DAYS * 86_400_000) {
      const prev = latestNew.get(cand.channel.channelId) ?? 0;
      latestNew.set(cand.channel.channelId, Math.max(prev, publishedMs));
      if (cand.channel.tier !== 1) promotedSet.set(cand.channel.channelId, cand.channel);
    }
    if (cls.kind === 'stream') streamRows.push(toStreamRow(cand.channel, v, cls.status, cls.is_schedule_frame, nowIso));
  }

  await db.upsert('schedule_seen_videos', seenRows, 'video_id');
  if (streamRows.length) {
    await db.upsert('streams', streamRows, 'platform,external_id');
    stats.streams_upserted += streamRows.length;
  }
  // last_new_video_at 記發布時間（不是掃到的時間），Heavy 重算分級時才不會被「掃描日」誤導
  if (latestNew.size) {
    await db.upsert(
      'schedule_channel_state',
      // 30 天內有新影片的頻道依定義就是 T1（原本就是 T1 的也一起刷新 last_new_video_at）
      [...latestNew].map(([channelId, ms]) => ({
        channel_id: channelId,
        tier: 1,
        tier_reason: 'new_video_seen',
        tier_updated_at: nowIso,
        last_new_video_at: new Date(ms).toISOString(),
      })),
      'channel_id',
    );
  }
  const promoted = [...promotedSet.values()];
  for (const c of promoted) c.tier = 1;
  return { promoted, upserted: streamRows };
}

/** 這些頻道已經分類過（schedule_seen_videos）或已在 streams 的 YouTube videoId */
export async function loadKnownVideoIds(db: Db, channelIds: readonly string[]): Promise<Set<string>> {
  const known = new Set<string>();
  for (let i = 0; i < channelIds.length; i += 100) {
    const list = inList(channelIds.slice(i, i + 100));
    const seen = await db.selectAll<{ video_id: string }>('schedule_seen_videos', `select=video_id&channel_id=${list}`, 'video_id');
    for (const r of seen) known.add(r.video_id);
    const inStreams = await db.selectAll<{ external_id: string }>('streams', `select=external_id&platform=eq.youtube&channel_id=${list}`, 'external_id');
    for (const r of inStreams) known.add(r.external_id);
  }
  return known;
}

function toStreamRow(ch: RosterChannel, v: YouTubeVideo, status: StreamStatus, frame: boolean, nowIso: string): StreamRow {
  return {
    vtuber_id: ch.vtuberId,
    channel_id: ch.channelId,
    platform: 'youtube',
    external_id: v.id,
    source: 'yt_waiting_room',
    status,
    scheduled_start: v.facts.scheduledStartTime ?? null,
    scheduled_end: null,
    actual_start: v.facts.actualStartTime ?? null,
    actual_end: v.facts.actualEndTime ?? null,
    title: v.title,
    category: null,
    thumbnail_url: v.thumbnailUrl,
    viewer_count: v.concurrentViewers,
    is_schedule_frame: frame,
    fetched_at: nowIso,
  };
}

/**
 * 讀要重查的 YouTube 場次。這一輪剛分類寫入的（fetched_at >= now）不用再查一次，省 videos.list。
 *
 * scope 決定配額：
 *   - 'near'（Light 每 5 分鐘）：直播中、或排定時間在 2 小時內（含已過期待判定）的非常駐框場次。
 *     遠期排程與常駐框每 5 分鐘重查沒有意義，卻會把每日配額吃到 3,000+ 單位。
 *   - 'all'（Heavy 每一片）：有排定時間、非常駐框的 scheduled / live（抓 tombstone 與改期）。
 *   - 'frames'（Heavy 游標歸零時）：常駐框，以及沒有排定時間的待機室（本地實測有 193 筆，永遠不會過期），
 *     一圈查一次就夠（確認還在、或被改回正常排程）。
 */
export type PendingScope = 'near' | 'all' | 'frames';

export async function loadPendingYouTube(db: Db, now: number, scope: PendingScope = 'all'): Promise<StreamRecord[]> {
  const nowIso = encodeURIComponent(new Date(now).toISOString());
  const base = `select=${STREAMS_COLS}&platform=eq.youtube&fetched_at=lt.${nowIso}`;
  if (scope === 'frames') {
    return db.selectAll<StreamRecord>(
      'streams',
      `${base}&status=eq.scheduled&or=(is_schedule_frame.eq.true,scheduled_start.is.null)`,
    );
  }
  if (scope === 'near') {
    const soon = encodeURIComponent(new Date(now + NEAR_WINDOW_MS).toISOString());
    return db.selectAll<StreamRecord>(
      'streams',
      `${base}&is_schedule_frame=eq.false&or=(status.eq.live,and(status.eq.scheduled,scheduled_start.lte.${soon}))`,
    );
  }
  return db.selectAll<StreamRecord>(
    'streams',
    `${base}&is_schedule_frame=eq.false&or=(status.eq.live,and(status.eq.scheduled,scheduled_start.not.is.null))`,
  );
}

/** 共享表要看的「目前狀態」：這些頻道所有 scheduled / live 的場次（含常駐框、含本輪剛寫入的） */
export async function loadCurrentByChannel(db: Db, channelIds: readonly string[]): Promise<Map<string, StreamRecord[]>> {
  const out = new Map<string, StreamRecord[]>();
  for (let i = 0; i < channelIds.length; i += 100) {
    const rows = await db.selectAll<StreamRecord>(
      'streams',
      `select=${STREAMS_COLS}&platform=eq.youtube&status=in.(scheduled,live)&channel_id=${inList(channelIds.slice(i, i + 100))}`,
    );
    for (const r of rows) {
      const list = out.get(r.channel_id) ?? [];
      list.push(r);
      out.set(r.channel_id, list);
    }
  }
  return out;
}

/** Light 重查的時間窗：排定時間在 2 小時內的才每 5 分鐘查 */
export const NEAR_WINDOW_MS = 2 * 3_600_000;

/**
 * 重查待處理場次：API 查不到 → hidden（tombstone）；其餘依 liveStreamingDetails 更新；
 * 排定時間過後 3 小時仍未開始 → expired。
 */
export async function refreshPending(
  db: Db,
  yt: YouTubeClient,
  pending: StreamRecord[],
  stats: RunStats,
  now: number,
): Promise<StreamRecord[]> {
  if (pending.length === 0) return [];
  const videos = await yt.listVideos(pending.map((p) => p.external_id));
  const nowIso = new Date(now).toISOString();
  const updated: StreamRecord[] = [];
  for (const p of pending) {
    const v = videos.get(p.external_id);
    const next: StreamRecord = { ...p, fetched_at: nowIso };
    if (!v) {
      next.status = 'hidden';
      stats.streams_hidden += 1;
    } else {
      const cls = classifyYouTubeVideo(v.facts, now);
      if (cls.kind === 'video') {
        // 直播細節消失（極少見）：當作已結束，不留在待處理
        next.status = 'ended';
      } else {
        next.status = cls.status;
        next.is_schedule_frame = cls.is_schedule_frame;
      }
      next.title = v.title ?? p.title;
      next.thumbnail_url = v.thumbnailUrl ?? p.thumbnail_url;
      next.scheduled_start = v.facts.scheduledStartTime ?? p.scheduled_start;
      next.actual_start = v.facts.actualStartTime ?? p.actual_start;
      next.actual_end = v.facts.actualEndTime ?? p.actual_end;
      next.viewer_count = next.status === 'live' ? v.concurrentViewers : null;
      if (isExpired(next, now)) {
        next.status = 'expired';
        stats.streams_expired += 1;
      }
    }
    updated.push(next);
  }
  // 以 (platform, external_id) upsert 整列；id 帶著走避免衝突到主鍵
  await db.upsert('streams', updated, 'platform,external_id');
  stats.pending_refreshed += updated.length;
  return updated;
}

/** Twitch 直播中 → streams（source twitch_live）；上一輪 live、這輪不在名單 → ended */
export async function syncTwitchLive(
  db: Db,
  twitch: TwitchClient,
  twitchChannels: RosterChannel[],
  stats: RunStats,
  now: number,
): Promise<{ liveVtuberIds: Set<string> }> {
  const liveVtuberIds = new Set<string>();
  if (twitchChannels.length === 0) return { liveVtuberIds };
  const byUserId = new Map(twitchChannels.map((c) => [c.externalId, c]));
  const live = await twitch.fetchLiveStreams([...byUserId.keys()]);
  stats.twitch_streams_calls = twitch.calls.streams;
  const nowIso = new Date(now).toISOString();

  const rows: StreamRow[] = [];
  for (const [userId, s] of live) {
    const ch = byUserId.get(userId);
    if (!ch || !s.streamId) continue;
    liveVtuberIds.add(ch.vtuberId);
    rows.push({
      vtuber_id: ch.vtuberId,
      channel_id: ch.channelId,
      platform: 'twitch',
      external_id: s.streamId,
      source: 'twitch_live',
      status: 'live',
      scheduled_start: null,
      scheduled_end: null,
      actual_start: s.startedAt,
      actual_end: null,
      title: s.title,
      category: s.gameName,
      thumbnail_url: s.thumbnailUrl,
      viewer_count: s.viewerCount,
      is_schedule_frame: false,
      fetched_at: nowIso,
    });
  }
  if (rows.length) await db.upsert('streams', rows, 'platform,external_id');
  stats.twitch_live += rows.length;

  // 上一輪 live 但這輪沒出現 → ended（只看 twitch_live；週表預告的狀態由 syncTwitchSchedule 管）
  const liveIds = new Set(rows.map((r) => r.external_id));
  const stale = await db.selectAll<{ id: string; external_id: string }>(
    'streams',
    'select=id,external_id&platform=eq.twitch&source=eq.twitch_live&status=eq.live',
  );
  const endedIds = stale.filter((s) => !liveIds.has(s.external_id)).map((s) => s.id);
  for (let i = 0; i < endedIds.length; i += 100) {
    await db.update('streams', `id=${inList(endedIds.slice(i, i + 100))}`, {
      status: 'ended',
      actual_end: nowIso,
      viewer_count: null,
      fetched_at: nowIso,
    });
  }
  stats.twitch_ended += endedIds.length;
  return { liveVtuberIds };
}

/**
 * Twitch 週表段落 → streams 列（純函式，測試直接餵）。
 * 取消（canceled_until 有值）或落在休假期間的段標 canceled；只收 [now − 3 小時, until] 內開始的段。
 */
export function scheduleRowsFor(
  ch: RosterChannel,
  schedule: TwitchSchedule,
  now: number,
  until: number,
): StreamRow[] {
  const nowIso = new Date(now).toISOString();
  const vac = schedule.vacation ? { s: Date.parse(schedule.vacation.start), e: Date.parse(schedule.vacation.end) } : null;
  const rows: StreamRow[] = [];
  for (const seg of schedule.segments) {
    const t = Date.parse(seg.startTime);
    if (!Number.isFinite(t) || t < now - EXPIRE_AFTER_HOURS * 3_600_000 || t > until) continue;
    const onVacation = !!vac && t >= vac.s && t < vac.e;
    rows.push({
      vtuber_id: ch.vtuberId,
      channel_id: ch.channelId,
      platform: 'twitch',
      external_id: seg.id,
      source: 'twitch_schedule',
      status: seg.canceledUntil || onVacation ? 'canceled' : 'scheduled',
      scheduled_start: seg.startTime,
      scheduled_end: seg.endTime,
      actual_start: null,
      actual_end: null,
      title: seg.title,
      category: seg.category,
      thumbnail_url: null,
      viewer_count: null,
      is_schedule_frame: false,
      fetched_at: nowIso,
    });
  }
  return rows;
}

/**
 * Twitch 週表：一個頻道一次 /helix/schedule（沒有批次端點）。
 * 回來的段 upsert；這個頻道未來、之前有但這次沒回來的段標 canceled（含整個週表被刪＝404）。
 * 預告過了開始時間 3 小時仍是 scheduled 的，標 expired。
 */
export async function syncTwitchSchedule(
  db: Db,
  twitch: TwitchClient,
  channels: RosterChannel[],
  opts: { concurrency: number; deadline: Deadline; stats: RunStats; now: number; days?: number },
): Promise<{ processed: number; advance: number }> {
  const { stats, now } = opts;
  const nowIso = new Date(now).toISOString();
  const until = now + (opts.days ?? UPCOMING_DAYS) * 86_400_000;
  // 每個頻道的結果：true＝完成、false＝這輪沒處理到（被限速或還沒輪到）
  const done = new Array<boolean>(channels.length).fill(false);
  const indexed = channels.map((ch, i) => ({ ch, i }));

  await mapLimit(indexed, opts.concurrency, opts.deadline, async ({ ch, i }) => {
    let schedule: TwitchSchedule | null;
    try {
      schedule = await twitch.fetchSchedule(ch.externalId, nowIso, until);
    } catch (e) {
      if (e instanceof HelixError && e.status === 429) {
        // 被限速：這輪不再開始新的頻道，這個頻道下一輪從游標重試（不算失敗）
        stats.twitch_schedule_rate_limited += 1;
        opts.deadline.at = Date.now();
        return;
      }
      // 其他錯誤（例如頻道被停權）：算處理過，避免卡住游標
      done[i] = true;
      stats.twitch_schedule_failed += 1;
      if (stats.errors.length < 20) stats.errors.push(`twitch schedule ${ch.externalId}: ${e instanceof Error ? e.message : e}`.slice(0, 200));
      return;
    }
    done[i] = true;
    const rows = schedule ? scheduleRowsFor(ch, schedule, now, until) : [];
    if (rows.length) {
      await db.upsert('streams', rows, 'platform,external_id');
      stats.twitch_schedule_segments += rows.length;
    }
    // tombstone：未來的預告這次沒回來 → 取消；翻頁沒走完時只作用到最後拿到的那一段（之後的沒被看到，不是取消）
    const keep = new Set(rows.map((r) => r.external_id));
    const coveredFilter = schedule?.coveredUntil ? `&scheduled_start=lte.${encodeURIComponent(schedule.coveredUntil)}` : '';
    const existing = await db.select<{ id: string; external_id: string }>(
      'streams',
      `select=id,external_id&channel_id=eq.${ch.channelId}&source=eq.twitch_schedule&status=eq.scheduled&scheduled_start=gt.${encodeURIComponent(nowIso)}${coveredFilter}&limit=200`,
    );
    const gone = existing.filter((r) => !keep.has(r.external_id)).map((r) => r.id);
    if (gone.length) {
      await db.update('streams', `id=${inList(gone)}`, { status: 'canceled', fetched_at: nowIso });
      stats.twitch_schedule_canceled += gone.length;
    }
  });
  stats.twitch_schedule_calls = twitch.calls.schedule;
  const processed = done.filter(Boolean).length;
  // 游標只前進到「從頭連續完成」的位置，被限速或沒輪到的頻道下一輪重來
  const firstMissing = done.indexOf(false);
  const advance = firstMissing === -1 ? channels.length : firstMissing;

  const expiredBefore = encodeURIComponent(new Date(now - EXPIRE_AFTER_HOURS * 3_600_000).toISOString());
  stats.streams_expired += await db.update(
    'streams',
    `source=eq.twitch_schedule&status=eq.scheduled&scheduled_start=lt.${expiredBefore}`,
    { status: 'expired', fetched_at: nowIso },
  );
  return { processed, advance };
}

/**
 * 離開 Twitch 名冊的頻道（畢業、停用）不會再輪到，它之前寫進去的未來預告要一次清掉。
 * Twitch 游標歸零那一片呼叫：讀目前所有未來的 twitch_schedule（數百筆），不在名冊裡的標 canceled。
 */
export async function cancelOrphanTwitchSchedule(db: Db, rosterChannelIds: ReadonlySet<string>, stats: RunStats, now: number): Promise<void> {
  const nowIso = new Date(now).toISOString();
  const rows = await db.selectAll<{ id: string; channel_id: string }>(
    'streams',
    `select=id,channel_id&source=eq.twitch_schedule&status=eq.scheduled&scheduled_start=gt.${encodeURIComponent(nowIso)}`,
  );
  const orphan = rows.filter((r) => !rosterChannelIds.has(r.channel_id)).map((r) => r.id);
  for (let i = 0; i < orphan.length; i += 100) {
    await db.update('streams', `id=${inList(orphan.slice(i, i + 100))}`, { status: 'canceled', fetched_at: nowIso });
  }
  stats.twitch_schedule_canceled += orphan.length;
}

/**
 * 附加步驟（Twitch 週表、合併、可索引旗標）失敗時只記錯誤不中斷：
 * 這些都是加分功能，不能擋住 RSS 游標前進與 snapshot 發布（runJob 遇到例外不會存游標）。
 */
export async function softStep(stats: RunStats, label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (stats.errors.length < 20) stats.errors.push(`${label}: ${e instanceof Error ? e.message : e}`.slice(0, 200));
  }
}

/**
 * 雙平台合併（見 merge.ts）：讀所有 scheduled／live 場次，加上最近 EXPIRE_AFTER_HOURS 內結束的場次（只當主場次），
 * 只寫 merged_with 有變的列。
 */
export async function applyMerges(db: Db, stats: RunStats, now: number): Promise<void> {
  const cols = 'select=id,vtuber_id,platform,source,status,scheduled_start,actual_start,is_schedule_frame,merged_with';
  const endedSince = encodeURIComponent(new Date(now - EXPIRE_AFTER_HOURS * 3_600_000).toISOString());
  const rows = [
    ...(await db.selectAll<MergeInput>('streams', `${cols}&status=in.(scheduled,live)`)),
    ...(await db.selectAll<MergeInput>('streams', `${cols}&status=eq.ended&actual_end=gte.${endedSince}`)),
  ];
  const changes = mergeChanges(rows);
  const byTarget = new Map<string, string[]>();
  for (const c of changes) {
    const key = c.merged_with ?? '';
    const list = byTarget.get(key) ?? [];
    list.push(c.id);
    byTarget.set(key, list);
  }
  for (const [target, ids] of byTarget) {
    for (let i = 0; i < ids.length; i += 100) {
      await db.update('streams', `id=${inList(ids.slice(i, i + 100))}`, { merged_with: target || null });
    }
  }
  stats.merges_changed += changes.length;
}

/** vtubers.last_live_at：這輪偵測到直播中的實況主 */
export async function touchLastLiveAt(db: Db, vtuberIds: Iterable<string>, stats: RunStats, now: number): Promise<void> {
  const ids = [...new Set(vtuberIds)];
  const nowIso = new Date(now).toISOString();
  for (let i = 0; i < ids.length; i += 100) {
    stats.last_live_at_updated += await db.update('vtubers', `id=${inList(ids.slice(i, i + 100))}`, { last_live_at: nowIso });
  }
}
