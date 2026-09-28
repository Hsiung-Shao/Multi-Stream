-- H-1: 收斂 user_profiles SELECT,擋匿名撈全表 PII
-- 原本: user_profiles_select (public, SELECT, USING true) → 任何人可讀整表
-- 改為: 只有本人 (auth.uid()) 或 admin 可讀
DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles
  FOR SELECT TO authenticated
  USING (supabase_auth_id = auth.uid() OR is_admin());
