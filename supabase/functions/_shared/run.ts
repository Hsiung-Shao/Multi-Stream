// 執行框架：驗證呼叫者、建 client、記錄 stats 到 cron_shard_state.last_run_stats、回 JSON。

import { isAuthorized } from './auth.ts';
import { Db, DbError } from './db.ts';
import { readScheduleEnv, type ScheduleEnv } from './env.ts';
import { TwitchClient } from './twitch.ts';
import { YouTubeClient } from './youtube.ts';
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
}

export async function loadShard(db: Db, job: string): Promise<ShardRow> {
  const rows = await db.select<ShardRow>('cron_shard_state', `select=job_name,cursor_position,shard_size,total_items,last_run_at&job_name=eq.${job}&limit=1`);
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
  const yt = new YouTubeClient({ apiKey: env.youtubeApiKey, referer: env.youtubeReferer });
  const twitch = new TwitchClient({ clientId: env.twitchClientId, clientSecret: env.twitchClientSecret, db });
  const ctx: RunContext = { env, db, yt, twitch, now: Date.now(), stats, params: new URL(req.url).searchParams };

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
  stats.playlist_items_calls = yt.quota.playlistItemsList;
  stats.quota_units = yt.quota.units();
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
