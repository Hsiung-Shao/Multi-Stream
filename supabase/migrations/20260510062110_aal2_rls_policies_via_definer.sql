-- 修正版：用 SECURITY DEFINER function 繞過 authenticated role 對 auth.mfa_factors 的權限限制
--
-- 上一個 migration (20260508) 直接在 RLS policy 子查詢用 from auth.mfa_factors，
-- 導致 client 的 authenticated role 評估 policy 時撞 permission denied → 連帶
-- 把 user_profiles / user_favorites 等 read 全擋掉。改用 SECURITY DEFINER function：
-- function 以 owner 權限執行子查詢，policy 只看 boolean 結果。

-- ============================================================================
-- helper function: has_verified_mfa
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

-- 撤回 public 預設執行權限，只 grant 給 authenticated
revoke execute on function public.has_verified_mfa() from public;
grant execute on function public.has_verified_mfa() to authenticated;

comment on function public.has_verified_mfa() is
  'Returns whether current authenticated user has any verified MFA factor. Used by RLS policies to enforce aal2 only for users who have opted into 2FA.';

-- ============================================================================
-- RLS policies (restrictive)：沒啟用 2FA 通過；啟用後必須 aal2
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
