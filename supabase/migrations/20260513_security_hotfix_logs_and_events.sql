-- Security Hotfix:cleanup_old_logs 權限收回 + vtuber_events admin policy bug 修正
--
-- 背景:
--   本 migration 處理 advisors / 內部審查中發現的兩個資安議題,動作彼此獨立,
--   合併在同一個 migration 一次處理。
--
-- ────────────────────────────────────────────────────────────────────────────
-- 議題 A:public.cleanup_old_logs() 對 authenticated / anon / PUBLIC 開放 EXECUTE
-- ────────────────────────────────────────────────────────────────────────────
--   現況:`SELECT grantee, privilege_type FROM information_schema.routine_privileges`
--         顯示 cleanup_old_logs 的 EXECUTE 同時授予 PUBLIC / anon / authenticated /
--         service_role / postgres。
--   問題:任何已登入(authenticated)的使用者可直接呼叫此 RPC,清空
--         system_logs / admin_actions / contribution_rate_limits。
--         即便 RLS 擋下 SELECT/INSERT,SECURITY DEFINER function 仍以
--         function owner 權限執行,RLS 無法保護。
--   修法:REVOKE EXECUTE FROM PUBLIC, anon, authenticated;
--         service_role 仍保有 EXECUTE(且 service_role BYPASS RLS、不受 grant 影響)。
--         僅供 cron job / 後端 service 呼叫。
--
-- ────────────────────────────────────────────────────────────────────────────
-- 議題 B:vtuber_events "Admins full access" policy 用錯欄位
-- ────────────────────────────────────────────────────────────────────────────
--   現況 qual:
--     EXISTS (
--       SELECT 1 FROM user_profiles
--       WHERE user_profiles.id = auth.uid()
--         AND user_profiles.trust_level IN ('admin','moderator')
--     )
--   問題:user_profiles.id 是 internal UUID(table PK),不是 Supabase auth user id;
--         auth.uid() 才對應 user_profiles.supabase_auth_id。這個 join 條件幾乎
--         永遠 false,policy 等於從未生效(admin 在 PostgREST 上完全無法管理 events)。
--         反過來如果有人手動把 user_profiles.id 設成 auth uid,又會繞過 trust_level
--         真正的限制。語意完全錯。
--   修法:DROP 舊 policy,改用本 repo 慣例 auth_trust_level(auth.uid()) IN
--         ('admin','moderator')(對齊 vtuber_livestreams "Admins can mutate livestreams"
--         與 vtuber_contributions "Admins can update contributions")。
--   風險評估:vtuber_events 目前 row_count = 0,本次修正純粹回到「policy 該長的樣子」,
--             不會誤刪/誤改任何既有資料。aal2 RESTRICTIVE policy(20260513_admin_aal2_rls_hardening)
--             仍保留並串接生效。
--
-- ============================================================================
-- Step A:REVOKE cleanup_old_logs EXECUTE
-- ============================================================================

revoke execute on function public.cleanup_old_logs() from public;
revoke execute on function public.cleanup_old_logs() from anon;
revoke execute on function public.cleanup_old_logs() from authenticated;

comment on function public.cleanup_old_logs() is
  'Service-only log cleanup. EXECUTE revoked from public/anon/authenticated; only service_role can invoke (typically via cron / backend functions).';

-- ============================================================================
-- Step B:DROP buggy vtuber_events admin policy + 重建為 auth_trust_level 版本
-- ============================================================================

drop policy if exists "Admins full access" on public.vtuber_events;

create policy "Admins can mutate events"
  on public.vtuber_events
  as permissive
  for all
  to authenticated
  using (
    public.auth_trust_level(auth.uid()) = any (array['admin','moderator'])
  )
  with check (
    public.auth_trust_level(auth.uid()) = any (array['admin','moderator'])
  );

-- ============================================================================
-- 驗證查詢(apply 後手動執行)
-- ============================================================================
-- 1) cleanup_old_logs 權限:
--    SELECT grantee, privilege_type
--    FROM information_schema.routine_privileges
--    WHERE routine_schema='public' AND routine_name='cleanup_old_logs';
--    預期:只剩 postgres / service_role(可能還有 owner)。
--
-- 2) vtuber_events policies:
--    SELECT policyname, permissive, cmd, qual
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename='vtuber_events'
--    ORDER BY policyname;
--    預期:
--      - "Admins can mutate events"(PERMISSIVE, ALL, auth_trust_level 版)
--      - "Anyone can read approved events"(unchanged)
--      - "Owners can update own events"(unchanged)
--      - "vtuber_events_admin_requires_aal2"(RESTRICTIVE, unchanged)
--      - 不應再有 "Admins full access"
--
-- ============================================================================
-- Rollback
-- ============================================================================
-- 若需退回,執行以下 SQL:
--
-- -- 回復 cleanup_old_logs 對 authenticated 的 EXECUTE(不建議):
-- grant execute on function public.cleanup_old_logs() to authenticated;
-- grant execute on function public.cleanup_old_logs() to anon;
-- grant execute on function public.cleanup_old_logs() to public;
--
-- -- 回復舊的 vtuber_events admin policy(注意:這個 policy 本身就有 bug):
-- drop policy if exists "Admins can mutate events" on public.vtuber_events;
-- create policy "Admins full access"
--   on public.vtuber_events
--   as permissive
--   for all
--   to public
--   using (
--     exists (
--       select 1 from public.user_profiles
--       where user_profiles.id = auth.uid()
--         and user_profiles.trust_level = any (array['admin','moderator'])
--     )
--   );
