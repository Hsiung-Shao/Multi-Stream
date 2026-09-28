-- PR 7 Hardening：admin / moderator 操作 admin tables 時強制 aal2
--
-- 目的：把「admin 必須 2FA」從只在 Cloudflare Function (auth-helper.requireAdminTrust)
-- 檢查的單點防線,延伸到 DB RLS 雙保險。

-- ============================================================================
-- 1. Helper function: auth_is_aal2()
-- ============================================================================
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

-- feedbacks
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

-- system_logs
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

-- admin_actions
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
