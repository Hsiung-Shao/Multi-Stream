-- 【本地專用】正式站沒有這一支 migration。
--
-- 20260510055002_aal2_rls_policies 建了 4 個直接查 auth.mfa_factors 的 restrictive policy，
-- 20260510062110_aal2_rls_policies_via_definer 又用「同名」重建成 SECURITY DEFINER 版本。
-- 正式站上這 4 個舊 policy 是在兩支 migration 之間手動 DROP 掉的（schema_migrations 沒有紀錄），
-- 所以照 version 順序從零重建時會在 062110 撞 42710 duplicate policy。
--
-- 依交接規則不改動匯出的 migration 內容，改在中間補一支只做 DROP 的本地 migration。
-- 結果與正式站一致：最終只剩 062110 建的 definer 版（2026-09-28 以 pg_policies 比對確認）。
DROP POLICY IF EXISTS "user_profiles_aal2_when_mfa_enrolled" ON public.user_profiles;
DROP POLICY IF EXISTS "user_favorites_aal2_when_mfa_enrolled" ON public.user_favorites;
DROP POLICY IF EXISTS "user_favorite_categories_aal2_when_mfa_enrolled" ON public.user_favorite_categories;
DROP POLICY IF EXISTS "user_favorite_tags_aal2_when_mfa_enrolled" ON public.user_favorite_tags;
