// 【只在本地跑】用 /helix/users?login= 補齊 vtuber_channels 裡只有 handle、沒有 broadcaster id 的 Twitch 帳號。
//
// 用法：
//   node scripts/local/backfill-twitch-ids.mjs            # 實跑（寫本地 DB）
//   node scripts/local/backfill-twitch-ids.mjs --dry-run  # 只查不寫
// 環境：TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET 讀 .dev.vars；
//       本地 Supabase 的 URL 與 service_role 讀 `supabase status -o env`（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 環境變數優先）。
// 寫回正式站要另外提出，由使用者核准；本腳本會拒絕非 127.0.0.1 / localhost 的 SUPABASE_URL。

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Db, inList } from '../../supabase/functions/_shared/db.ts';
import { TwitchClient } from '../../supabase/functions/_shared/twitch.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const dryRun = process.argv.includes('--dry-run');

function loadDevVars() {
  const candidates = [join(repoRoot, '.dev.vars'), 'D:\\codeproject\\web\\multi-stream\\.dev.vars'];
  const file = candidates.find((p) => existsSync(p));
  if (!file) throw new Error('找不到 .dev.vars');
  const vars = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return vars;
}

function loadLocalSupabase() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  const out = execSync('supabase status -o env', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const get = (k) => (out.match(new RegExp(`^${k}="?([^"\\r\\n]+)"?`, 'm')) || [])[1];
  const url = get('API_URL');
  const key = get('SERVICE_ROLE_KEY') || get('SECRET_KEY');
  if (!url || !key) throw new Error('supabase status 讀不到 API_URL / SERVICE_ROLE_KEY');
  return { url, key };
}

const dev = loadDevVars();
const local = loadLocalSupabase();
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(local.url)) {
  throw new Error(`拒絕對非本地 Supabase 寫入：${local.url}`);
}

const db = new Db({ url: local.url, serviceRoleKey: local.key });
const twitch = new TwitchClient({ clientId: dev.TWITCH_CLIENT_ID, clientSecret: dev.TWITCH_CLIENT_SECRET, db });

const rows = await db.selectAll('vtuber_channels', 'select=id,handle,display_name&platform=eq.twitch&status=eq.active&external_id=is.null');
console.log(`只有 handle 的 Twitch 帳號：${rows.length}`);
const found = await twitch.fetchUserIdsByLogin(rows.map((r) => r.handle));
console.log(`helix/users 查到：${found.size}（呼叫 ${twitch.calls.users} 次）`);

const nowIso = new Date().toISOString();
let updated = 0;
const missing = [];
for (const r of rows) {
  const hit = found.get(r.handle.toLowerCase());
  if (!hit) {
    missing.push(r.handle);
    continue;
  }
  if (dryRun) {
    updated += 1;
    continue;
  }
  // 逐筆 PATCH：同一個 broadcaster id 若已被別列占用（部分唯一索引），跳過並記錄
  try {
    updated += await db.update('vtuber_channels', `id=eq.${r.id}`, {
      external_id: hit.id,
      display_name: r.display_name ?? hit.displayName,
      updated_at: nowIso,
    });
  } catch (e) {
    missing.push(`${r.handle} (${e.message.slice(0, 80)})`);
  }
}
console.log(JSON.stringify({ dryRun, updated, notFound: missing.length, notFoundSample: missing.slice(0, 20) }, null, 2));
