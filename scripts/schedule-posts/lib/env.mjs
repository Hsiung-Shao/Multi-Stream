// 環境設定：
//   --env prod  讀 scripts/schedule-posts/.env（正式站 service_role；已 gitignore，範本見 .env.example）
//   --env local 連線資料由 `supabase status -o json` 取得（一定是 127.0.0.1 的本地堆疊）
// 2026-10-05 教訓：repo 根目錄的 .dev.vars 的 SUPABASE_URL 指向正式站，不能拿它當「本地」設定
// （memory error_dev_vars_points_to_production）；這裡另外用 URL 防呆：local 只接受 localhost／127.0.0.1，prod 不接受。
// 讀圖由 Claude Desktop 排程任務本身完成，不需要任何模型 API 金鑰。

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SCRIPT_DIR = resolve(here, '..');
export const REPO_ROOT = resolve(here, '..', '..', '..');

/** KEY=VALUE 逐行；# 開頭是註解；值兩端的引號去掉 */
export function parseEnvText(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return vars;
}

export const isLocalUrl = (url) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url ?? '');

/** 在 git worktree（.claude/worktrees/<name>）裡跑時，gitignore 的設定檔只在主工作區：一併找 */
function candidates(name) {
  const list = [join(REPO_ROOT, name)];
  const m = REPO_ROOT.replace(/\\/g, '/').match(/^(.*)\/\.claude\/worktrees\/[^/]+$/);
  if (m) list.push(join(m[1], name));
  return list;
}

function localStatus(cwd) {
  const out = execSync('npx supabase status -o json', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.slice(out.indexOf('{')));
}

/**
 * @param {'prod'|'local'} mode
 * @returns {{ file: string, supabaseUrl: string, serviceRoleKey: string }}
 */
export function loadEnv(mode, { status = localStatus } = {}) {
  if (mode === 'local') {
    const s = status(REPO_ROOT);
    const supabaseUrl = String(s.API_URL ?? '').replace(/\/$/, '');
    if (!isLocalUrl(supabaseUrl) || !s.SERVICE_ROLE_KEY) throw new Error('supabase status 沒有回本地 API_URL／SERVICE_ROLE_KEY（本地堆疊有在跑嗎？）');
    return { file: 'supabase status', supabaseUrl, serviceRoleKey: s.SERVICE_ROLE_KEY };
  }
  const files = candidates('scripts/schedule-posts/.env');
  const file = files.find((f) => existsSync(f));
  if (!file) throw new Error(`找不到 ${files.join(' 或 ')}（複製 .env.example 填入）`);
  const vars = parseEnvText(readFileSync(file, 'utf8'));
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (!vars[k]) throw new Error(`${file} 缺 ${k}`);
  const supabaseUrl = vars.SUPABASE_URL.replace(/\/$/, '');
  if (isLocalUrl(supabaseUrl)) throw new Error(`--env prod 的 SUPABASE_URL 不能是本地網址（${supabaseUrl}）；本地請用 --env local`);
  return { file, supabaseUrl, serviceRoleKey: vars.SUPABASE_SERVICE_ROLE_KEY };
}
