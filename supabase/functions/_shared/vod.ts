// 歷史紀錄連 VOD：場次結束後補 vod_id／vod_status（migration 20261104 streams_vod）。
//   - Twitch：external_id 是直播 id，對不到 VOD；用 Helix /videos?user_id=<broadcaster>&type=archive 的 stream_id 對回來。
//     每個 broadcaster 一次呼叫，每輪最多 VOD_TWITCH_USERS_PER_RUN 個（subrequest 上限，見 memory digest_edge_limits）。
//   - YouTube：不用 Data API（專案規則：非必要不用 YouTube API）；打 oEmbed，200＝影片還在，404／400／403＝刪除／私人／id 壞
//     （2026-11-04 拿正式庫三支已被隱藏的影片實測：回 404、403、404）。
//     401 是「停用嵌入」（影片其實看得到）：維持 unknown 之後再查，不當 missing。
//     剛結束的存檔可能還在處理，所以結束不到 24 小時的「找不到」只更新 checked_at，維持 unknown 之後再查。
//   - 429／5xx／0（逾時、連線錯）= 上游限速或故障：本輪停、不改狀態（memory error_youtube_rss_429_burst：停本輪不算失敗）。
// 純函式（reconcile*）與 I/O（runVodStep）分開，測試直接餵假的 helix／fetch。
import type { Db } from './db.ts';
import type { RunStats } from './types.ts';
import type { TwitchClient } from './twitch.ts';

export const VOD_TWITCH_USERS_PER_RUN = 20;
export const VOD_YT_PER_RUN = 40;
export const VOD_YT_CONCURRENCY = 4;
export const VOD_MISSING_AFTER_MS = 24 * 3_600_000;
export const VOD_TIME_BOX_MS = 8_000;
export const VOD_PENDING_LIMIT = 200;
/** Helix /videos 一次最多 100 筆；回滿 100 筆代表清單可能被截，對不到的不能當 missing */
export const VOD_TWITCH_FIRST = 100;
const VIDEOS_URL = 'https://api.twitch.tv/helix/videos';
const OEMBED_URL = 'https://www.youtube.com/oembed';

export interface VodPending {
  id: string;
  platform: 'youtube' | 'twitch';
  external_id: string;
  actual_end: string;
  broadcaster_id: string | null;
}

export interface VodResult {
  id: string;
  vod_id: string | null;
  vod_status: 'ok' | 'missing' | 'unknown';
  vod_checked_at: string;
}

const olderThanDay = (p: VodPending, now: number) => now - Date.parse(p.actual_end) > VOD_MISSING_AFTER_MS;

function notFound(p: VodPending, now: number, nowIso: string): VodResult {
  return { id: p.id, vod_id: null, vod_status: olderThanDay(p, now) ? 'missing' : 'unknown', vod_checked_at: nowIso };
}

/**
 * Twitch：依 broadcaster 分組，每組查一次 archive 清單，對 stream_id。
 * helix 回 null（錯誤／限速）→ 該組不寫、算 deferred；超過每輪上限的組整組 deferred。
 */
export async function reconcileTwitchVods(
  pending: VodPending[],
  helix: (url: string) => Promise<unknown | null>,
  now: number,
  deadlineAt: number = Number.POSITIVE_INFINITY,
): Promise<{ results: VodResult[]; calls: number; deferred: number }> {
  const nowIso = new Date(now).toISOString();
  const groups = new Map<string, VodPending[]>();
  let deferred = 0;
  for (const p of pending) {
    if (p.platform !== 'twitch') continue;
    if (!p.broadcaster_id) {
      deferred += 1;
      continue;
    }
    const list = groups.get(p.broadcaster_id) ?? [];
    list.push(p);
    groups.set(p.broadcaster_id, list);
  }
  const results: VodResult[] = [];
  let calls = 0;
  for (const [userId, items] of groups) {
    if (calls >= VOD_TWITCH_USERS_PER_RUN || Date.now() >= deadlineAt) {
      deferred += items.length;
      continue;
    }
    calls += 1;
    // helixGet 本身錯誤回 null；這裡再接一層，任何拋錯都當該組這輪查不到（deferred），不讓整個步驟中止
    const res = await helix(`${VIDEOS_URL}?user_id=${encodeURIComponent(userId)}&type=archive&first=${VOD_TWITCH_FIRST}`).catch(() => null);
    const data = res && typeof res === 'object' && Array.isArray((res as { data?: unknown }).data) ? (res as { data: unknown[] }).data : null;
    if (!data) {
      deferred += items.length;
      continue;
    }
    const byStream = new Map<string, string>();
    for (const v of data) {
      if (!v || typeof v !== 'object') continue;
      const { id, stream_id } = v as { id?: unknown; stream_id?: unknown };
      if (typeof id === 'string' && typeof stream_id === 'string') byStream.set(stream_id, id);
    }
    // 回滿一頁＝更舊的封存可能在下一頁：對不到的只更新 checked_at，維持 unknown（不寫 missing）
    const truncated = data.length >= VOD_TWITCH_FIRST;
    for (const p of items) {
      const vodId = byStream.get(p.external_id);
      if (vodId) results.push({ id: p.id, vod_id: vodId, vod_status: 'ok', vod_checked_at: nowIso });
      else results.push(truncated ? { id: p.id, vod_id: null, vod_status: 'unknown', vod_checked_at: nowIso } : notFound(p, now, nowIso));
    }
  }
  return { results, calls, deferred };
}

/**
 * YouTube：oEmbed 探測，每輪最多 VOD_YT_PER_RUN 筆、同時 VOD_YT_CONCURRENCY 條。
 * 429／5xx／拋錯 → throttled，之後的全部 deferred、不寫結果。
 */
export async function reconcileYouTubeVods(
  pending: VodPending[],
  fetchFn: typeof fetch,
  now: number,
  deadlineAt: number = Number.POSITIVE_INFINITY,
): Promise<{ results: VodResult[]; checked: number; deferred: number; throttled: boolean }> {
  const nowIso = new Date(now).toISOString();
  const yt = pending.filter((p) => p.platform === 'youtube');
  const todo = yt.slice(0, VOD_YT_PER_RUN);
  let deferred = yt.length - todo.length;
  const results: VodResult[] = [];
  let throttled = false;
  let next = 0;
  const worker = async () => {
    while (!throttled && next < todo.length) {
      if (Date.now() >= deadlineAt) break; // 預算用完：剩下的算 deferred
      const p = todo[next++];
      let status: number;
      try {
        const url = `${OEMBED_URL}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${p.external_id}`)}&format=json`;
        const res = await fetchFn(url, { signal: AbortSignal.timeout(VOD_TIME_BOX_MS), redirect: 'manual' });
        status = res.status;
        await res.body?.cancel().catch(() => {});
      } catch {
        status = 0;
      }
      if (status === 200) results.push({ id: p.id, vod_id: p.external_id, vod_status: 'ok', vod_checked_at: nowIso });
      else if (status === 404 || status === 400 || status === 403) results.push(notFound(p, now, nowIso));
      else if (status === 401) results.push({ id: p.id, vod_id: null, vod_status: 'unknown', vod_checked_at: nowIso });
      else if (status === 429 || status >= 500 || status === 0) {
        throttled = true;
        deferred += 1;
      } else {
        // 其他（3xx 等）：不改狀態，下輪再查，不當限速
        results.push({ id: p.id, vod_id: null, vod_status: 'unknown', vod_checked_at: nowIso });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(VOD_YT_CONCURRENCY, todo.length) }, worker));
  // 限速後沒輪到的
  deferred += Math.max(0, todo.length - next);
  return { results, checked: results.length, deferred, throttled };
}

/** 排程步驟：拿待查清單 → 兩個平台各自對 → 寫回；統計進 stats.vod_* */
export async function runVodStep(db: Db, twitch: TwitchClient, stats: RunStats, now: number, fetchFn: typeof fetch = fetch, deadlineAt: number = Number.POSITIVE_INFINITY): Promise<void> {
  // 超過 14 天仍 unknown 的改成終態 expired（不再查，也離開部分索引；前端把它當「還沒查到」）。放在最前：沒有待查也要跑
  const expired = await db.rpc<number>('schedule_vod_expire').catch(() => null);
  if (typeof expired === 'number') stats.vod_expired = (stats.vod_expired as number ?? 0) + expired;
  const pending = (await db.rpc<VodPending[]>('schedule_vod_pending', { p_limit: VOD_PENDING_LIMIT })) ?? [];
  if (pending.length === 0) return;
  // 整個步驟不超過 light 輪的預算，最多再給自己一個時間盒
  const stepDeadline = Math.min(deadlineAt, Date.now() + VOD_TIME_BOX_MS * 3);
  const tw = await reconcileTwitchVods(pending, (url) => twitch.helixGet(url), now, stepDeadline);
  const yt = await reconcileYouTubeVods(pending, fetchFn, now, stepDeadline);
  const results = [...tw.results, ...yt.results];
  if (results.length) await db.rpc('schedule_vod_write', { p_rows: results });
  stats.vod_checked = (stats.vod_checked as number ?? 0) + results.length;
  stats.vod_ok = (stats.vod_ok as number ?? 0) + results.filter((r) => r.vod_status === 'ok').length;
  stats.vod_missing = (stats.vod_missing as number ?? 0) + results.filter((r) => r.vod_status === 'missing').length;
  stats.vod_deferred = (stats.vod_deferred as number ?? 0) + tw.deferred + yt.deferred;
  stats.vod_twitch_calls = (stats.vod_twitch_calls as number ?? 0) + tw.calls;
  if (yt.throttled) stats.vod_yt_throttled = true;
}
