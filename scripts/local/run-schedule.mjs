// 【本地量測】手動觸發排程 Edge Functions，收集每輪 stats 寫成報告。
//
// 用法（先 `supabase functions serve --env-file supabase/functions/.env --no-verify-jwt`）：
//   node scripts/local/run-schedule.mjs heavy-loop          # Heavy 呼叫到游標繞回 0（一次全量）
//   node scripts/local/run-schedule.mjs light 3             # Light 跑 3 輪
//   node scripts/local/run-schedule.mjs heavy 1 shard_size=400
// 輸出：scripts/local/reports/<timestamp>-<mode>.json（已 gitignore 的目錄外；報告不含金鑰）

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const [mode = 'light', countArg = '1', ...extra] = process.argv.slice(2);
const query = extra.length ? '?' + extra.join('&') : '';

function localSupabase() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  const out = execSync('supabase status -o env', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const get = (k) => (out.match(new RegExp(`^${k}="?([^"\\r\\n]+)"?`, 'm')) || [])[1];
  return { url: get('API_URL'), key: get('SERVICE_ROLE_KEY') || get('SECRET_KEY') };
}

const { url, key } = localSupabase();
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error(`只允許本地：${url}`);

async function invoke(fn) {
  const t0 = Date.now();
  const res = await fetch(`${url}/functions/v1/${fn}${query}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { http: res.status, wall_ms: Date.now() - t0, ...body };
}

async function shard(job) {
  const res = await fetch(`${url}/rest/v1/cron_shard_state?select=job_name,cursor_position,shard_size,total_items&job_name=eq.${job}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return (await res.json())[0];
}

const runs = [];
const fn = mode.startsWith('heavy') ? 'schedule-heavy' : 'schedule-light';
if (mode === 'heavy-loop') {
  // 游標繞回（變小或歸零）就是一圈；總數不一定被 shard_size 整除，所以不能只看 === 0
  let prev = (await shard('schedule_heavy_rss')).cursor_position;
  for (let i = 0; i < 50; i++) {
    const r = await invoke(fn);
    const s = await shard('schedule_heavy_rss');
    runs.push({ ...r, cursor_after: s.cursor_position });
    console.log(`#${i + 1} http=${r.http} wall=${r.wall_ms}ms processed=${r.channels_processed} rss_fail=${r.rss_failed}${r.rss_throttled ? "(throttled)" : ""} og=${r.og_checked}/live${r.og_live}/fail${r.og_failed} quota=${r.quota_units}(day ${r.quota_daily_used}) upserted=${r.streams_upserted} pending=${r.pending_refreshed} cursor→${s.cursor_position} errors=${JSON.stringify(r.errors ?? [])}`);
    if (r.http !== 200 || s.cursor_position <= prev) break;
    prev = s.cursor_position;
  }
} else {
  const n = Number(countArg) || 1;
  for (let i = 0; i < n; i++) {
    const r = await invoke(fn);
    runs.push(r);
    console.log(`#${i + 1} http=${r.http} wall=${r.wall_ms}ms processed=${r.channels_processed}/${r.channels_total} rss_fail=${r.rss_failed}${r.rss_throttled ? "(throttled)" : ""} og=${r.og_checked}/live${r.og_live}/fail${r.og_failed} quota=${r.quota_units}(day ${r.quota_daily_used}) pending=${r.pending_refreshed} twitch_live=${r.twitch_live} live_status=${r.live_status_rows} snapshot=${r.snapshot_bytes}B errors=${JSON.stringify(r.errors ?? [])}`);
    if (i < n - 1) await new Promise((r) => setTimeout(r, 3000));
  }
}

const sum = (k) => runs.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const summary = {
  mode,
  runs: runs.length,
  wall_ms_total: sum('wall_ms'),
  channels_processed: sum('channels_processed'),
  rss_ok: sum('rss_ok'),
  rss_failed: sum('rss_failed'),
  rss_rate_limited: sum('rss_rate_limited'),
  rss_throttled_runs: runs.filter((r) => r.rss_throttled).length,
  rss_entries: sum('rss_entries'),
  new_video_candidates: sum('new_video_candidates'),
  videos_list_calls: sum('videos_list_calls'),
  api_deferred: sum('api_deferred'),
  quota_daily_used_last: runs.at(-1)?.quota_daily_used ?? null,
  quota_exceeded_runs: runs.filter((r) => r.quota_exceeded).length,
  og_checked: sum('og_checked'),
  og_failed: sum('og_failed'),
  og_fail_reasons: runs.reduce((acc, r) => {
    for (const [k, n] of Object.entries(r.og_fail_reasons ?? {})) acc[k] = (acc[k] ?? 0) + n;
    return acc;
  }, {}),
  og_full_page: sum('og_full_page'),
  og_live: sum('og_live'),
  og_upcoming: sum('og_upcoming'),
  og_ended: sum('og_ended'),
  og_foreign: sum('og_foreign'),
  og_end_suppressed_runs: runs.filter((r) => r.og_end_suppressed).length,
  quota_units: sum('quota_units'),
  streams_upserted: sum('streams_upserted'),
  streams_hidden: sum('streams_hidden'),
  streams_expired: sum('streams_expired'),
  pending_refreshed: sum('pending_refreshed'),
  twitch_streams_calls: sum('twitch_streams_calls'),
  twitch_live: sum('twitch_live'),
  twitch_ended: sum('twitch_ended'),
  live_status_rows: sum('live_status_rows'),
  errors: runs.flatMap((r) => r.errors ?? []),
};
console.log(JSON.stringify(summary, null, 2));

const dir = join(here, 'reports');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}.json`);
writeFileSync(file, JSON.stringify({ summary, runs }, null, 2), 'utf8');
console.log(`report: ${file}`);
