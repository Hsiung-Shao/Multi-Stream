-- 2FA 啟用後強制 aal2 才能 access user 隱私資料（DB 層防線）
-- 模式：依 Supabase MFA 文件「Enforce only for users that have opted-in」
-- 沒啟用 2FA 的 user 不受影響（aal1 + aal2 都允許）
-- 啟用 2FA 的 user 必須 aal2 才能 read/write 自己的隱私資料

create policy "user_profiles_aal2_when_mfa_enrolled" on public.user_profiles
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );

create policy "user_favorites_aal2_when_mfa_enrolled" on public.user_favorites
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );

create policy "user_favorite_categories_aal2_when_mfa_enrolled" on public.user_favorite_categories
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );

create policy "user_favorite_tags_aal2_when_mfa_enrolled" on public.user_favorite_tags
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );
