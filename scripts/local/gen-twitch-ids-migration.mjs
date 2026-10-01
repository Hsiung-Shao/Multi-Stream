// 【本地產生器】把本地 DB 已補好的 Twitch broadcaster id（backfill-twitch-ids.mjs 用 /helix/users 查的）
// 產生成資料 migration，供正式站套用（2026-10-02 使用者核准：週表後端先上正式站）。
//
// 用法：node scripts/local/gen-twitch-ids-migration.mjs supabase/migrations/20261002100100_twitch_ids_backfill.sql
//
// 產出的 migration：只補 external_id 為空的 Twitch 帳號（依 handle 不分大小寫對應），不覆蓋既有值；
// 同一個 broadcaster id 已被別列占用（部分唯一索引）就跳過。資料 migration 由本產生器產生，不要手改。
// 讀本地 Supabase（`supabase status -o env`），拒絕非本地網址。

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) throw new Error('用法：node scripts/local/gen-twitch-ids-migration.mjs <輸出 .sql 路徑>');

const env = execSync('supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const get = (k) => (env.match(new RegExp(`^${k}="?([^"\\r\\n]+)"?`, 'm')) || [])[1];
const url = get('API_URL');
const key = get('SERVICE_ROLE_KEY') || get('SECRET_KEY');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error(`只允許本地：${url}`);

const rows = [];
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${url}/rest/v1/vtuber_channels?select=handle,external_id&platform=eq.twitch&external_id=not.is.null&order=handle.asc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
  });
  const page = await res.json();
  rows.push(...page);
  if (page.length < 1000) break;
}

const HANDLE_RE = /^[a-zA-Z0-9_]{1,25}$/;
const ID_RE = /^\d{1,20}$/;
const seen = new Set();
const pairs = [];
for (const r of rows) {
  const handle = String(r.handle).toLowerCase();
  // 只收格式正確的值（SQL 字面值不必跳脫）；同一個 handle 只取第一筆
  if (!HANDLE_RE.test(handle) || !ID_RE.test(String(r.external_id)) || seen.has(handle)) continue;
  seen.add(handle);
  pairs.push([handle, String(r.external_id)]);
}
if (!pairs.length) throw new Error('本地沒有已補的 Twitch id（先跑 backfill-twitch-ids.mjs）');

const values = pairs.map(([h, id]) => `    ('${h}', '${id}')`).join(',\n');
const sql = `-- 【產生檔，勿手改】scripts/local/gen-twitch-ids-migration.mjs 從本地 DB 產生（${new Date().toISOString().slice(0, 10)}，${pairs.length} 筆）。
--
-- 週表的 Twitch 直播中（/helix/streams）與週表（/helix/schedule）都靠 vtuber_channels.external_id（broadcaster id）；
-- 正式站的 Twitch 帳號多半只有 handle。本地已用 /helix/users?login= 查過（backfill-twitch-ids.mjs），這裡寫回正式站。
-- 只補 external_id 為空的列（依 handle 不分大小寫對應），不覆蓋既有值；同一個 id 已被別列占用就跳過（部分唯一索引）。
--
-- 回滾：本檔只補空值，回滾＝把這些 id 清回 null：
--   update public.vtuber_channels c set external_id = null
--   from (values ...同下...) v(handle, id) where c.platform = 'twitch' and c.external_id = v.id;

update public.vtuber_channels c
set external_id = v.id,
    updated_at = now()
from (values
${values}
) as v(handle, id)
where c.platform = 'twitch'
  and c.external_id is null
  and lower(c.handle) = v.handle
  and not exists (
      select 1 from public.vtuber_channels x
      where x.platform = 'twitch' and x.external_id = v.id
  );
`;
writeFileSync(out, sql);
console.log(`寫入 ${out}：${pairs.length} 筆`);
