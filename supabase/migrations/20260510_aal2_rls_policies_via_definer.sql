-- 修正版：用 SECURITY DEFINER function 繞過 authenticated role 對 auth.mfa_factors 的權限限制
--
-- 上一個 migration (20260508_aal2_rls_policies.sql) 直接在 RLS policy 子查詢用
-- `from auth.mfa_factors`，導致 client 的 authenticated role 評估 policy 時撞
-- "permission denied for table mfa_factors" → 連帶把 user_profiles / user_favorites
-- 等所有 read 都擋掉，user 登入後完全看不到自己的資料。
--
-- 本 migration：
-- 1. 移除 20260508 加的 4 個 policies
-- 2. 建立 SECURITY DEFINER helper function public.has_verified_mfa()，function 以 owner
--    權限訪問 auth.mfa_factors，policy 只看 boolean 結果
-- 3. 重建 4 個 RLS policies 改用 helper function
--
-- 配合 client：src/hooks/useAuth.ts mfaRequired + AuthProvider 渲染 MfaLoginGate

-- ============================================================================
-- 1. Rollback 舊 policies
-- ============================================================================
drop policy if exists "user_profiles_aal2_when_mfa_enrolled" on public.user_profiles;
drop policy if exists "user_favorites_aal2_when_mfa_enrolled" on public.user_favorites;
drop policy if exists "user_favorite_categories_aal2_when_mfa_enrolled" on public.user_favorite_categories;
drop policy if exists "user_favorite_tags_aal2_when_mfa_enrolled" on public.user_favorite_tags;

-- ============================================================================
-- 2. Helper function: has_verified_mfa
-- ============================================================================
create or replace function public.has_verified_mfa()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists(
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  );
$$;

revoke execute on function public.has_verified_mfa() from public;
grant execute on function public.has_verified_mfa() to authenticated;

comment on function public.has_verified_mfa() is
  'Returns whether current authenticated user has any verified MFA factor. Used by RLS policies to enforce aal2 only for users who have opted into 2FA.';

-- ============================================================================
-- 3. RLS policies (RESTRICTIVE)：沒啟用 2FA 通過；啟用後必須 aal2
-- ============================================================================
create policy "user_profiles_aal2_when_mfa_enrolled"
  on public.user_profiles
  as restrictive
  to authenticated
  using (
    not public.has_verified_mfa()
    or (select auth.jwt()->>'aal') = 'aal2'
  );

create policy "user_favorites_aal2_when_mfa_enrolled"
  on public.user_favorites
  as restrictive
  to authenticated
  using (
    not public.has_verified_mfa()
    or (select auth.jwt()->>'aal') = 'aal2'
  );

create policy "user_favorite_categories_aal2_when_mfa_enrolled"
  on public.user_favorite_categories
  as restrictive
  to authenticated
  using (
    not public.has_verified_mfa()
    or (select auth.jwt()->>'aal') = 'aal2'
  );

create policy "user_favorite_tags_aal2_when_mfa_enrolled"
  on public.user_favorite_tags
  as restrictive
  to authenticated
  using (
    not public.has_verified_mfa()
    or (select auth.jwt()->>'aal') = 'aal2'
  );

-- ============================================================================
-- Rollback 指令（如需）
-- ============================================================================
-- drop policy if exists "user_profiles_aal2_when_mfa_enrolled" on public.user_profiles;
-- drop policy if exists "user_favorites_aal2_when_mfa_enrolled" on public.user_favorites;
-- drop policy if exists "user_favorite_categories_aal2_when_mfa_enrolled" on public.user_favorite_categories;
-- drop policy if exists "user_favorite_tags_aal2_when_mfa_enrolled" on public.user_favorite_tags;
-- drop function if exists public.has_verified_mfa();
