// 執行框架：驗證呼叫者、建 client、記錄 stats 到 cron_shard_state.last_run_stats、回 JSON。

import { isAuthorized } from './auth.ts';
import { Db, DbError } from './db.ts';
import { readScheduleEnv, type ScheduleEnv } from './env.ts';
import { TwitchClient } from './twitch.ts';
import { YouTubeClient } from './youtube.ts';
import { DAILY_QUOTA_CAP, MAX_VIDEOS_LIST_CALLS_PER_RUN, quotaDay } from './rules.ts';
import type { RunStats } from './types.ts';

export interface RunContext {
  env: ScheduleEnv;
  db: Db;
  yt: YouTubeClient;
  twitch: TwitchClient;
  now: number;
  stats: RunStats;
  /** 從 URL 讀的選項（本地測試用） */
  params: URLSearchParams;
}

interface ShardRow {
  job_name: string;
  cursor_position: number;
  shard_size: number;
  total_items: number | null;
  last_run_at: string | null;
  last_run_stats: { cursor_start?: number; cursor_advance?: number } | null;
}

export async function loadShard(db: Db, job: string): Promise<ShardRow> {
  const rows = await db.select<ShardRow>('cron_shard_state', `select=job_name,cursor_position,shard_size,total_items,last_run_at,last_run_stats&job_name=eq.${job}&limit=1`);
  if (!rows[0]) throw new Error(`cron_shard_state 缺 ${job}`);
  return rows[0];
}

export async function saveShard(
  db: Db,
  job: string,
  patch: { cursor_position?: number; total_items?: number; stats: RunStats },
): Promise<void> {
  await db.update('cron_shard_state', `job_name=eq.${job}`, {
    ...(patch.cursor_position != null ? { cursor_position: patch.cursor_position } : {}),
    ...(patch.total_items != null ? { total_items: patch.total_items } : {}),
    last_run_at: patch.stats.finished_at,
    last_run_stats: patch.stats,
    updated_at: patch.stats.finished_at,
  });
}

/** 每日 YouTube 配額用量：cron_shard_state 的 youtube_quota_daily 列（cursor_position＝已用單位、last_run_stats.day＝配額日） */
export const QUOTA_JOB = 'youtube_quota_daily';

export async function loadDailyQuota(db: Db, now: number): Promise<number | null> {
  const rows = await db.select<{ cursor_position: number; last_run_stats: { day?: string } | null }>(
    'cron_shard_state',
    `select=cursor_position,last_run_stats&job_name=eq.${QUOTA_JOB}&limit=1`,
  );
  if (!rows[0]) return null; // 還沒有這一列（migration 未套）：只套每輪上限
  return rows[0].last_run_stats?.day === quotaDay(now) ? rows[0].cursor_position : 0;
}

/**
 * 本輪用量原子累加（schedule_add_quota，20260930140100）：Light 與 Heavy 同時跑時先讀再寫會漏算。
 * 用量為 0 時不寫，只讀；YouTube 回 quotaExceeded 時直接記到上限，整天不再打。
 */
export async function addDailyQuota(db: Db, now: number, units: number, exceeded = false): Promise<number | null> {
  const add = exceeded ? Math.max(units, DAILY_QUOTA_CAP) : units;
  if (add <= 0) return loadDailyQuota(db, now);
  const total = await db.rpc<number>('schedule_add_quota', { p_day: quotaDay(now), p_units: add });
  return typeof total === 'number' ? total : null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * 包住一次執行：401 擋非授權、統一錯誤處理。stats 由 body 產生；就算中途失敗也把 stats 寫回，
 * 方便從 cron_shard_state 看到最後一次的狀況。
 */
export async function runJob(
  req: Request,
  job: 'heavy' | 'light',
  shardJobName: string,
  body: (ctx: RunContext) => Promise<{ cursor_position?: number; total_items?: number }>,
  stats: RunStats,
): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'GET') return jsonResponse({ error: 'method not allowed' }, 405);
  let env: ScheduleEnv;
  try {
    env = readScheduleEnv();
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'env' }, 500);
  }
  if (!isAuthorized(req, env)) return jsonResponse({ error: 'unauthorized' }, 401);

  const db = new Db({ url: env.supabaseUrl, serviceRoleKey: env.serviceRoleKey });
  const startedAt = Date.now();
  // API 最後：每輪上限與每日剩餘額度取小的；讀不到每日用量時只套每輪上限
  let usedToday: number | null = null;
  try {
    usedToday = await loadDailyQuota(db, startedAt);
  } catch (e) {
    // 讀不到仍照跑（只套每輪上限），但要留紀錄，配額表異常時才看得到
    usedToday = null;
    stats.errors.push(`quota: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
  }
  const maxCalls = Math.min(MAX_VIDEOS_LIST_CALLS_PER_RUN, usedToday == null ? Infinity : Math.max(0, DAILY_QUOTA_CAP - usedToday));
  const yt = new YouTubeClient({ apiKey: env.youtubeApiKey, referer: env.youtubeReferer, maxCalls });
  const twitch = new TwitchClient({ clientId: env.twitchClientId, clientSecret: env.twitchClientSecret, db });
  const ctx: RunContext = { env, db, yt, twitch, now: startedAt, stats, params: new URL(req.url).searchParams };

  let cursor: { cursor_position?: number; total_items?: number } = {};
  let status = 200;
  try {
    cursor = await body(ctx);
  } catch (e) {
    status = 500;
    const detail = e instanceof DbError ? ` ${e.body}` : '';
    stats.errors.push(e instanceof Error ? `${e.name}: ${e.message}${detail}`.slice(0, 600) : String(e));
    console.error(`[schedule-${job}]`, e);
  }
  stats.videos_list_calls = yt.quota.videosList;
  stats.quota_units = yt.quota.units();
  try {
    stats.quota_exceeded = yt.quotaExceeded;
    stats.quota_daily_used = (await addDailyQuota(db, ctx.now, stats.quota_units, yt.quotaExceeded)) ?? stats.quota_units;
  } catch (e) {
    stats.errors.push(`quota daily: ${e instanceof Error ? e.message : String(e)}`);
  }
  stats.finished_at = new Date().toISOString();
  stats.duration_ms = Date.now() - ctx.now;
  try {
    await saveShard(db, shardJobName, { ...cursor, stats });
  } catch (e) {
    stats.errors.push(`saveShard: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`[schedule-${job}] ${JSON.stringify(stats)}`);
  return jsonResponse(stats, status);
}
