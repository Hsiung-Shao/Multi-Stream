// 排程 Edge Function 的呼叫者驗證。
//
// Supabase 閘道（verify_jwt）只確認「是本專案的 JWT」，anon key 也過得了；排程函式會寫資料庫、
// 打第三方 API、發布 snapshot，所以自己再驗一次：只接受 service_role key，或 pg_cron 用的共用密鑰。

import type { ScheduleEnv } from './env.ts';

export function isAuthorized(req: Request, env: Pick<ScheduleEnv, 'serviceRoleKey' | 'cronSecret'>): boolean {
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (bearer && timingSafeEqual(bearer, env.serviceRoleKey)) return true;
  const secret = req.headers.get('x-schedule-secret') || '';
  if (env.cronSecret && secret && timingSafeEqual(secret, env.cronSecret)) return true;
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
