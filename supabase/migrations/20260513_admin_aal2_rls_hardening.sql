-- PR 7 Hardening：admin / moderator 操作 admin tables 時強制 aal2
--
-- 目的：把「admin 必須 2FA」從只在 Cloudflare Function (auth-helper.requireAdminTrust)
-- 檢查的單點防線,延伸到 DB RLS 雙保險。即使有人繞過 Function 直接呼 PostgREST
-- (拿到 authenticated JWT + 偽造 admin 身分),aal1 session 也會被 RLS 擋下。
--
-- 配合：
--   - functions/lib/auth-helper.js requireAdminTrust() 已強制 aal=aal2
--   - 20260510_aal2_rls_policies_via_definer.sql 已為 user-facing 表加了相同模式 policy
--   - 本檔針對「只有 admin/moderator 會碰到」的 10 個 admin tables 補上 aal2 雙保險
--
-- 設計：RESTRICTIVE policy + 兩種模式:
--   (A) is_admin() 系列 tables — 大部分 admin RLS 寫 is_admin()(只認 'admin')
--   (B) auth_trust_level(auth.uid()) IN (admin,moderator) 系列 — 部分舊 policy(events/livestreams ALL,
--       contributions 部分 select/update)允許 moderator
--   policy 條件:NOT (該 table 的 admin gate) OR has_verified_mfa() AND aal2
--   翻譯為人話:
--     - 非 admin/moderator 操作(一般 user / 匿名 select)→ 本 policy 不觸發攔截
--     - admin/moderator 操作 → 必須已啟用 MFA 且 session 是 aal2
--   注意:用 has_verified_mfa() 是為了「admin 還沒 enroll TOTP 時不被鎖在門外」
--   (現實:管理員首次部署本 migration 時可能還沒 enroll TOTP,先讓他能登入再去 enroll)
--   ⚠️ 安全考量:這留了一個「admin 沒 enroll MFA 時 aal1 可動」的窗口。
--      → 必須搭配 ops 規範:所有 admin 帳號必須先 enroll TOTP 才能持續操作。
--      → 等所有 admin 都 enroll 完,可再考慮把 has_verified_mfa() 條件移除改硬性 aal2。
--
-- MFA Recovery 救援路徑(管理員務必先確認):
--   - admin 卡關 TOTP 時:用備援碼 → POST /api/account/totp-recover(aal1 即可呼叫)
--     → 後端用 service_role 跑 RPC delete_user_totp_factor 移除 factor
--     → 重新登入後 user 進 aal1 但 has_verified_mfa() = false → 本 policy 放行
--     → user 進帳號設定重新 enroll TOTP
--   - 若連備援碼都遺失:管理員直接連 Supabase Dashboard 用 service_role
--     刪 auth.mfa_factors 該 row(本 RLS 不影響 service_role)
--
-- ============================================================================
-- 1. Helper function: auth_is_aal2()
-- ============================================================================
-- 用 SECURITY DEFINER 包一層讀 auth.jwt(),避免 RLS policy 重複寫 (select auth.jwt()->>'aal')
-- 並讓 search_path 嚴格鎖死(防 search_path 注入)。
create or replace function public.auth_is_aal2()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce((auth.jwt()->>'aal') = 'aal2', false);
$$;

revoke execute on function public.auth_is_aal2() from public;
grant execute on function public.auth_is_aal2() to authenticated;

comment on function public.auth_is_aal2() is
  'Returns true if current JWT aal claim is aal2. Used by admin-side RLS policies to enforce 2FA gating in addition to has_verified_mfa() and is_admin()/auth_trust_level().';

-- ============================================================================
-- 2. RESTRICTIVE policies — 強制 admin/moderator 走 aal2
--    模式公式:當 caller 是 admin/moderator 且已啟用 MFA → 必須 aal2
--             否則(非 admin/moderator,或 admin 未 enroll) → 放行給其他 policy 評估
--    用 AS RESTRICTIVE → 與既有 PERMISSIVE policy AND 串接
-- ============================================================================

-- --- (A) is_admin() 系列(僅 admin)----------------------------------------

-- vtubers
create policy "vtubers_admin_requires_aal2"
  on public.vtubers
  as restrictive
  to authenticated
  using (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  )
  with check (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  );

-- vtuber_groups
create policy "vtuber_groups_admin_requires_aal2"
  on public.vtuber_groups
  as restrictive
  to authenticated
  using (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  )
  with check (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  );

-- posts
create policy "posts_admin_requires_aal2"
  on public.posts
  as restrictive
  to authenticated
  using (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  )
  with check (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  );

-- post_reports
create policy "post_reports_admin_requires_aal2"
  on public.post_reports
  as restrictive
  to authenticated
  using (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  )
  with check (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  );

-- feedbacks（anon INSERT permissive 不受影響:RESTRICTIVE 對 authenticated only）
create policy "feedbacks_admin_requires_aal2"
  on public.feedbacks
  as restrictive
  to authenticated
  using (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  )
  with check (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  );

-- system_logs(roles=public,但 admin policy 用 is_admin())
create policy "system_logs_admin_requires_aal2"
  on public.system_logs
  as restrictive
  to authenticated
  using (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  )
  with check (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  );

-- admin_actions(roles=public,但 admin policy 用 is_admin())
create policy "admin_actions_admin_requires_aal2"
  on public.admin_actions
  as restrictive
  to authenticated
  using (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  )
  with check (
    not (public.is_admin() and public.has_verified_mfa())
    or public.auth_is_aal2()
  );

-- --- (B) auth_trust_level admin+moderator 系列 -------------------------------
--     (vtuber_livestreams / vtuber_events / vtuber_contributions 既有 admin
--      policy 走 auth_trust_level → 這裡同步用 trust_level 比對)

-- vtuber_livestreams
create policy "vtuber_livestreams_admin_requires_aal2"
  on public.vtuber_livestreams
  as restrictive
  to authenticated
  using (
    not (
      public.auth_trust_level(auth.uid()) = any (array['admin','moderator'])
      and public.has_verified_mfa()
    )
    or public.auth_is_aal2()
  )
  with check (
    not (
      public.auth_trust_level(auth.uid()) = any (array['admin','moderator'])
      and public.has_verified_mfa()
    )
    or public.auth_is_aal2()
  );

-- vtuber_events
create policy "vtuber_events_admin_requires_aal2"
  on public.vtuber_events
  as restrictive
  to authenticated
  using (
    not (
      public.auth_trust_level(auth.uid()) = any (array['admin','moderator'])
      and public.has_verified_mfa()
    )
    or public.auth_is_aal2()
  )
  with check (
    not (
      public.auth_trust_level(auth.uid()) = any (array['admin','moderator'])
      and public.has_verified_mfa()
    )
    or public.auth_is_aal2()
  );

-- vtuber_contributions
create policy "vtuber_contributions_admin_requires_aal2"
  on public.vtuber_contributions
  as restrictive
  to authenticated
  using (
    not (
      public.auth_trust_level(auth.uid()) = any (array['admin','moderator'])
      and public.has_verified_mfa()
    )
    or public.auth_is_aal2()
  )
  with check (
    not (
      public.auth_trust_level(auth.uid()) = any (array['admin','moderator'])
      and public.has_verified_mfa()
    )
    or public.auth_is_aal2()
  );

-- ============================================================================
-- 3. 驗證查詢（apply 後手動 select 確認 policy 存在）
-- ============================================================================
-- SELECT tablename, policyname, permissive
-- FROM pg_policies
-- WHERE schemaname='public' AND policyname LIKE '%_admin_requires_aal2'
-- ORDER BY tablename;

-- ============================================================================
-- 4. Rollback（依次 drop policy 與 helper function）
-- ============================================================================
-- 如部署後造成 admin 操作異常,逐條退回:
--
-- drop policy if exists "vtubers_admin_requires_aal2" on public.vtubers;
-- drop policy if exists "vtuber_groups_admin_requires_aal2" on public.vtuber_groups;
-- drop policy if exists "posts_admin_requires_aal2" on public.posts;
-- drop policy if exists "post_reports_admin_requires_aal2" on public.post_reports;
-- drop policy if exists "feedbacks_admin_requires_aal2" on public.feedbacks;
-- drop policy if exists "system_logs_admin_requires_aal2" on public.system_logs;
-- drop policy if exists "admin_actions_admin_requires_aal2" on public.admin_actions;
-- drop policy if exists "vtuber_livestreams_admin_requires_aal2" on public.vtuber_livestreams;
-- drop policy if exists "vtuber_events_admin_requires_aal2" on public.vtuber_events;
-- drop policy if exists "vtuber_contributions_admin_requires_aal2" on public.vtuber_contributions;
-- drop function if exists public.auth_is_aal2();
