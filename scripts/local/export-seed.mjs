// 從正式站（唯讀）匯出本地 Supabase 的 seed.sql
//
// 用法：node scripts/local/export-seed.mjs
// 讀 .dev.vars 的 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，走 PostgREST 只做 GET，
// 輸出 supabase/seed.sql（已 gitignore：內容是正式站資料）。
//
// 匯出的表：vtuber_groups、vtubers、vtuber_channels、youtube_channels，
// 以及 vtuber_channel_metrics_daily 三個日期切面（最新、約 30 天前、約 90 天前；
// 取「不晚於目標日」的最近一天，分級需要的就是這三個切面）。
// 絕不匯出 user_*、feedbacks、announcement_responses、vtuber_contributions 等含使用者資料的表。
//
// PostgREST 預設 max_rows=1000 會靜默截斷，所以一律用 Range 分頁。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

function loadDevVars() {
  const candidates = [
    join(repoRoot, '.dev.vars'),
    'D:\\codeproject\\web\\multi-stream\\.dev.vars',
  ];
  const file = candidates.find((p) => existsSync(p));
  if (!file) throw new Error('找不到 .dev.vars');
  const vars = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return vars;
}

const env = loadDevVars();
const BASE = (env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) throw new Error('.dev.vars 缺 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');

const PAGE = 1000;

// PostgREST 分頁不帶 order 會回不穩定的順序（實測 7,398 列少 468 列），一律以主鍵排序
async function fetchAll(table, query = '', orderBy = 'id') {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const url = `${BASE}/rest/v1/${table}?select=*&order=${orderBy}${query ? "&" + query : ""}`;
    const res = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
        'Range-Unit': 'items',
        Prefer: 'count=exact',
      },
    });
    if (res.status !== 200 && res.status !== 206) {
      throw new Error(`${table} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const chunk = await res.json();
    rows.push(...chunk);
    const total = Number((res.headers.get('content-range') || '').split('/')[1]);
    if (chunk.length < PAGE || (Number.isFinite(total) && rows.length >= total)) break;
  }
  return rows;
}

async function nearestMetricDate(targetIso) {
  const url = `${BASE}/rest/v1/vtuber_channel_metrics_daily?select=metric_date&metric_date=lte.${targetIso}&order=metric_date.desc&limit=1`;
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`metric date lookup HTTP ${res.status}`);
  const rows = await res.json();
  if (rows.length) return rows[0].metric_date;
  // 目標日之前完全沒有資料 → 取最早的一天
  const res2 = await fetch(
    `${BASE}/rest/v1/vtuber_channel_metrics_daily?select=metric_date&order=metric_date.asc&limit=1`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  );
  const rows2 = await res2.json();
  return rows2[0]?.metric_date ?? null;
}

// ---- SQL 字面值 ----
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (Array.isArray(v)) {
    if (v.length === 0) return "'{}'";
    return `ARRAY[${v.map(lit).join(',')}]`;
  }
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insertStatements(table, rows, batch = 200) {
  if (!rows.length) return `-- ${table}: 0 rows\n`;
  const cols = Object.keys(rows[0]);
  const out = [`-- ${table}: ${rows.length} rows`];
  for (let i = 0; i < rows.length; i += batch) {
    const values = rows
      .slice(i, i + batch)
      .map((r) => `(${cols.map((c) => lit(r[c])).join(',')})`)
      .join(',\n');
    out.push(`INSERT INTO public.${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES\n${values}\nON CONFLICT DO NOTHING;`);
  }
  return out.join('\n') + '\n';
}

/** 本檔停用 trigger，slug（NOT NULL、trigger 配號）要先放寬、資料進來後回填；正式站還沒有 slug 欄位時兩段都略過 */
const SLUG_RELAX = `-- slug（20260929100000_schedule_stage2）是 NOT NULL、由 trigger 配號；本檔停用了 trigger，先放寬，
-- 等 youtube_channels 進來後依 stage2 同一套規則回填（handle 優先）再改回 NOT NULL
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vtubers' AND column_name = 'slug') THEN
    ALTER TABLE public.vtubers ALTER COLUMN slug DROP NOT NULL;
  END IF;
END $$;
`;
const SLUG_BACKFILL = `-- slug 回填（與 20260929100000_schedule_stage2 相同的兩階段；只補空值，避開已被 migration 資料占用的與保留字）
DO $$
DECLARE
  r record;
  v_base text;
  candidate text;
  n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vtubers' AND column_name = 'slug') THEN
    RETURN;
  END IF;
  WITH c AS (
    SELECT id, public.schedule_slug_candidate(id, youtube_channel_id, twitch_channel_id) AS base, created_at
    FROM public.vtubers WHERE slug IS NULL
  ), ranked AS (
    SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY created_at, id) AS rn FROM c
  )
  UPDATE public.vtubers v SET slug = rk.base
  FROM ranked rk
  WHERE rk.id = v.id AND rk.rn = 1 AND rk.base NOT IN ('submit', 'report')
    AND NOT EXISTS (SELECT 1 FROM public.vtubers x WHERE x.slug = rk.base);
  FOR r IN SELECT id, youtube_channel_id, twitch_channel_id FROM public.vtubers WHERE slug IS NULL ORDER BY created_at, id LOOP
    v_base := public.schedule_slug_candidate(r.id, r.youtube_channel_id, r.twitch_channel_id);
    n := 1;
    LOOP
      n := n + 1;
      candidate := left(v_base, 36) || '-' || n;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.vtubers WHERE slug = candidate);
    END LOOP;
    UPDATE public.vtubers SET slug = candidate WHERE id = r.id;
  END LOOP;
  ALTER TABLE public.vtubers ALTER COLUMN slug SET NOT NULL;
END $$;
`;

const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

const main = async () => {
  const t0 = Date.now();
  // 子團的 parent_id 指向同表的公司：公司（parent_id 為 null）排前面，分批插入時不會先插到子團
  const groups = (await fetchAll('vtuber_groups')).sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
  const vtubers = await fetchAll('vtubers');
  const channels = await fetchAll('vtuber_channels');
  const yt = await fetchAll('youtube_channels');

  const dates = [...new Set(await Promise.all([daysAgo(0), daysAgo(30), daysAgo(90)].map(nearestMetricDate)))].filter(Boolean);
  const metrics = await fetchAll('vtuber_channel_metrics_daily', `metric_date=in.(${dates.join(',')})`);

  const header = [
    '-- 由 scripts/local/export-seed.mjs 產生，內容為正式站資料的唯讀複本；已 gitignore。',
    `-- generated_at: ${new Date().toISOString()}`,
    `-- metric_dates: ${dates.join(', ')}`,
    'BEGIN;',
    'SET LOCAL session_replication_role = replica; -- 略過 updated_at 等 trigger，保留原始時間戳',
    '',
  ].join('\n');

  const body =
    insertStatements('vtuber_groups', groups) +
    SLUG_RELAX +
    insertStatements('vtubers', vtubers) +
    insertStatements('vtuber_channels', channels) +
    insertStatements('youtube_channels', yt) +
    SLUG_BACKFILL +
    insertStatements('vtuber_channel_metrics_daily', metrics) +
    '\n-- 讓 member_count 與實際資料一致\nUPDATE public.vtuber_groups vg SET member_count = (SELECT count(*) FROM public.vtubers v WHERE v.group_id = vg.id);\nCOMMIT;\n';

  const outDir = join(repoRoot, 'supabase');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'seed.sql');
  writeFileSync(outFile, header + body, 'utf8');

  console.log(
    JSON.stringify(
      {
        vtuber_groups: groups.length,
        vtubers: vtubers.length,
        vtuber_channels: channels.length,
        youtube_channels: yt.length,
        metric_dates: dates,
        vtuber_channel_metrics_daily: metrics.length,
        bytes: Buffer.byteLength(header + body),
        seconds: Math.round((Date.now() - t0) / 100) / 10,
      },
      null,
      2,
    ),
  );
};

main().catch((e) => {
  console.error('export-seed failed:', e.message);
  process.exit(1);
});
