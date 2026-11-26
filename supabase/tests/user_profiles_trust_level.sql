-- user_profiles 權限欄位不可由使用者自己寫：trust_level（決定 is_admin）、post_count、report_count。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/user_profiles_trust_level.sql
-- 整檔一個交易、結尾 ROLLBACK；斷言失敗 RAISE EXCEPTION。

BEGIN;

-- 假使用者（只存在這個交易）
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'p1@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'p2@example.test');

-- 以「已登入的 p1」身分經 PostgREST 等效路徑操作
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);

-- P1 新增自己的資料時帶 trust_level=admin：不得生效
INSERT INTO public.user_profiles (supabase_auth_id, display_name, trust_level, post_count, report_count)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'p1', 'admin', 999, 999);

DO $$
DECLARE r record;
BEGIN
  SELECT trust_level, post_count, report_count INTO r FROM public.user_profiles WHERE supabase_auth_id = auth.uid();
  IF r.trust_level <> 'new' OR r.post_count <> 0 OR r.report_count <> 0 THEN
    RAISE EXCEPTION 'P1 失敗：新增時可自設權限欄位 trust_level=% post_count=% report_count=%', r.trust_level, r.post_count, r.report_count;
  END IF;
END $$;

-- P2 更新自己的 trust_level：不得生效，但一般欄位可改
UPDATE public.user_profiles SET trust_level = 'admin', post_count = 5, display_name = 'renamed' WHERE supabase_auth_id = auth.uid();

DO $$
DECLARE r record;
BEGIN
  SELECT trust_level, post_count, display_name INTO r FROM public.user_profiles WHERE supabase_auth_id = auth.uid();
  IF r.trust_level <> 'new' OR r.post_count <> 0 THEN
    RAISE EXCEPTION 'P2 失敗：更新時可自改權限欄位 trust_level=% post_count=%', r.trust_level, r.post_count;
  END IF;
  IF r.display_name <> 'renamed' THEN
    RAISE EXCEPTION 'P2 失敗：一般欄位 display_name 應可更新，得到 %', r.display_name;
  END IF;
END $$;

-- P3 自升失敗後 is_admin() 仍為 false
DO $$
BEGIN
  IF public.is_admin() THEN RAISE EXCEPTION 'P3 失敗：一般使用者 is_admin() 為 true'; END IF;
END $$;

-- P4 後台（無 JWT 的 postgres／service_role）仍可設定管理員
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.user_profiles SET trust_level = 'admin' WHERE supabase_auth_id = '00000000-0000-0000-0000-0000000000a1';
DO $$
BEGIN
  IF (SELECT trust_level FROM public.user_profiles WHERE supabase_auth_id = '00000000-0000-0000-0000-0000000000a1') <> 'admin' THEN
    RAISE EXCEPTION 'P4 失敗：後台無法設定 trust_level';
  END IF;
END $$;

SELECT 'user_profiles_trust_level: 全部通過' AS result;
ROLLBACK;
