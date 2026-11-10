-- advisor auth_rls_initplan 收尾（2026-11-10）：4 條 *_aal2_when_mfa_enrolled 的 ( SELECT (auth.jwt() ->> 'aal')) 改寫成
-- (( SELECT auth.jwt() AS jwt) ->> 'aal')，advisor 才認得是 initplan；語意相同。回滾：把 using 換回原寫法。
alter policy user_favorite_categories_aal2_when_mfa_enrolled on public.user_favorite_categories
  using (((NOT ( SELECT has_verified_mfa() AS has_verified_mfa)) OR ((( SELECT auth.jwt() AS jwt) ->> 'aal'::text) = 'aal2'::text)));
alter policy user_favorite_tags_aal2_when_mfa_enrolled on public.user_favorite_tags
  using (((NOT ( SELECT has_verified_mfa() AS has_verified_mfa)) OR ((( SELECT auth.jwt() AS jwt) ->> 'aal'::text) = 'aal2'::text)));
alter policy user_favorites_aal2_when_mfa_enrolled on public.user_favorites
  using (((NOT ( SELECT has_verified_mfa() AS has_verified_mfa)) OR ((( SELECT auth.jwt() AS jwt) ->> 'aal'::text) = 'aal2'::text)));
alter policy user_profiles_aal2_when_mfa_enrolled on public.user_profiles
  using (((NOT ( SELECT has_verified_mfa() AS has_verified_mfa)) OR ((( SELECT auth.jwt() AS jwt) ->> 'aal'::text) = 'aal2'::text)));
