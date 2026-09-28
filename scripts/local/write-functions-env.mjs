// 從 .dev.vars 挑出 Edge Functions 需要的第三方金鑰，寫成 supabase/functions/.env（已 gitignore）。
//
// 用法：node scripts/local/write-functions-env.mjs
// 只挑 YouTube / Twitch 的鍵；**不**帶正式站的 SUPABASE_URL / SERVICE_ROLE_KEY ——
// 本地 edge runtime 會自動注入本地的 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。
// 值不印到 stdout。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const PICK = ['YOUTUBE_API_KEY', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'];

const candidates = [join(repoRoot, '.dev.vars'), 'D:\\codeproject\\web\\multi-stream\\.dev.vars'];
const src = candidates.find((p) => existsSync(p));
if (!src) {
  console.error('找不到 .dev.vars');
  process.exit(1);
}

const vars = {};
for (const line of readFileSync(src, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) vars[m[1]] = m[2].replace(/^"|"$/g, '');
}

const missing = PICK.filter((k) => !vars[k]);
if (missing.length) {
  console.error('.dev.vars 缺少：' + missing.join(', '));
  process.exit(1);
}

const lines = [
  '# 由 scripts/local/write-functions-env.mjs 產生；已 gitignore。本地 Edge Functions 用。',
  ...PICK.map((k) => `${k}=${vars[k]}`),
  'YOUTUBE_API_REFERER=https://multistreaming.org',
  // 本地測試用的排程觸發密鑰（正式環境另設）
  `SCHEDULE_CRON_SECRET=${vars.SCHEDULE_CRON_SECRET || 'local-dev-schedule-secret'}`,
  '',
];
mkdirSync(join(repoRoot, 'supabase', 'functions'), { recursive: true });
const out = join(repoRoot, 'supabase', 'functions', '.env');
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`wrote ${out} (${PICK.length + 2} keys, values not shown)`);
