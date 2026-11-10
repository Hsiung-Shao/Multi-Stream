-- Supabase advisor lint 修正的行為與權限測試：
--   S1a/S1c 在 migration 前預期紅（anon/authenticated 仍有執行權限、increment_post_report_count 還在）
--   S1b/S2 是「改寫後行為不變」的守門，migration 前後都應綠
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/advisor_lint_fixes.sql
-- 只跑守門項（略過 S1a/S1c）：加 -v skip_red=1
-- 整檔在一個交易內，結尾 ROLLBACK。斷言失敗一律 RAISE EXCEPTION，通過印 NOTICE PASS。

BEGIN;

-- ───────────── 測資：兩個使用者（zz 前綴） ─────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000aa01', 'zz-advisor-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000aa02', 'zz-advisor-b@example.invalid');

-- B 的收藏（以 postgres 身分寫入，繞過 RLS）
INSERT INTO public.user_favorites (user_id, client_id, url, name, platform) VALUES
  ('00000000-0000-4000-8000-00000000aa02', 'zz-fav-b', 'https://example.invalid/b', 'zz B 的收藏', 'other');

\echo '測資建立完成'

\if :{?skip_red}
\echo '略過 S1a / S1c（skip_red）'
\else
-- ───────────── S1a：anon／authenticated 不能呼叫三支 RPC ─────────────
DO $$
DECLARE
  r text;
  calls text[] := ARRAY[
    $q$select * from public.increment_contribution_quota('00000000-0000-4000-8000-00000000aa01'::uuid, 'vtuber', 5)$q$,
    $q$select * from public.get_vtuber_by_channel('youtube', 'zz-none')$q$,
    $q$select * from public.search_vtubers('zz', 5, 0.3::real)$q$
  ];
  c text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH c IN ARRAY calls LOOP
      BEGIN
        EXECUTE format('set local role %I', r);
        EXECUTE c;
        EXECUTE 'reset role';
        RAISE EXCEPTION 'S1a 失敗：% 竟可呼叫 %', r, c;
      EXCEPTION WHEN insufficient_privilege THEN
        EXECUTE 'reset role';
      END;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS S1a：anon／authenticated 呼叫三支 RPC 皆被拒（42501）';
END $$;

-- ───────────── S1c：increment_post_report_count 已移除 ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'increment_post_report_count') THEN
    RAISE EXCEPTION 'S1c 失敗：public.increment_post_report_count 仍存在';
  END IF;
  RAISE NOTICE 'PASS S1c：increment_post_report_count 已不存在';
END $$;
\endif

-- ───────────── S1b：service_role 仍可呼叫 increment_contribution_quota ─────────────
DO $$
DECLARE a boolean; n integer;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT allowed, new_count INTO a, n
    FROM public.increment_contribution_quota('00000000-0000-4000-8000-00000000aa01', 'vtuber', 5);
  RESET ROLE;
  IF a IS NOT TRUE OR n <> 1 THEN
    RAISE EXCEPTION 'S1b 失敗：預期 allowed=true,new_count=1，實得 %,%', a, n;
  END IF;
  RAISE NOTICE 'PASS S1b：service_role 可呼叫 increment_contribution_quota 且計數正確';
END $$;

-- ───────────── S2：user_favorites RLS 行為不變 ─────────────
-- 模擬使用者 A（aal1；A 未註冊 MFA，aal2 restrictive policy 應放行）
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000aa01","role":"authenticated","aal":"aal1"}';

DO $$
DECLARE n integer; blocked boolean := false;
BEGIN
  -- A 可 insert 自己的列
  INSERT INTO public.user_favorites (user_id, client_id, url, name, platform)
  VALUES ('00000000-0000-4000-8000-00000000aa01', 'zz-fav-a', 'https://example.invalid/a', 'zz A 的收藏', 'other');

  -- A 可 select 自己的列
  SELECT count(*) INTO n FROM public.user_favorites WHERE client_id = 'zz-fav-a';
  IF n <> 1 THEN RAISE EXCEPTION 'S2 失敗：A 應看到自己 1 列，實得 %', n; END IF;
  RAISE NOTICE 'PASS S2a：A 可 insert／select 自己的列';

  -- A 看不到 B 的列（且整表只見自己的）
  SELECT count(*) INTO n FROM public.user_favorites WHERE user_id = '00000000-0000-4000-8000-00000000aa02';
  IF n <> 0 THEN RAISE EXCEPTION 'S2 失敗：A 竟看到 B 的列 %', n; END IF;
  SELECT count(*) INTO n FROM public.user_favorites;
  IF n <> 1 THEN RAISE EXCEPTION 'S2 失敗：A 應只見 1 列，實得 %', n; END IF;
  RAISE NOTICE 'PASS S2b：A 看不到 B 的列';

  -- A 不能 insert user_id=B 的列
  BEGIN
    INSERT INTO public.user_favorites (user_id, client_id, url, name, platform)
    VALUES ('00000000-0000-4000-8000-00000000aa02', 'zz-fav-evil', 'https://example.invalid/e', 'zz 偽造', 'other');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'S2 失敗：A 竟能以 B 的 user_id 寫入'; END IF;
  RAISE NOTICE 'PASS S2c：A 不能代 B 寫入（RLS 擋下）';
END $$;

RESET ROLE;

-- anon 讀不到任何列（無權限或 0 列皆可）
DO $$
DECLARE n integer;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.user_favorites;
  EXCEPTION WHEN insufficient_privilege THEN
    n := 0;
  END;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'S2 失敗：anon 竟讀到 % 列', n; END IF;
  RAISE NOTICE 'PASS S2d：anon 讀不到 user_favorites';
END $$;

ROLLBACK;
