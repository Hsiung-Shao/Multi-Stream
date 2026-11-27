-- 投稿記到帳號（U6、U7）與問卷答案認領（U8 的 SQL 部分）。
--   四張投稿表新增 user_id（刪帳號後設 null）、my_submissions()（只回自己的、最多 50 筆、固定五個欄位）、
--   claim_announcement_responses(p_user_id, p_device_id)（只有 service_role 能執行）。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/submissions_user_id.sql
-- 整檔一個交易、結尾 ROLLBACK；斷言失敗 RAISE EXCEPTION。

BEGIN;

-- 假使用者（只存在這個交易）
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'sa@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'sb@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'sc@example.test');

-- ========== U6：刪帳號後投稿保留但不再關聯 ==========
INSERT INTO public.vtuber_contributions (id, action, payload, status, user_id, submitted_by)
VALUES ('00000000-0000-0000-0000-00000000d001', 'add', '{}', 'pending', '00000000-0000-0000-0000-0000000000c3', 'user');
INSERT INTO public.vtuber_reports (id, kind, user_id)
VALUES ('00000000-0000-0000-0000-00000000d002', 'missing_vtuber', '00000000-0000-0000-0000-0000000000c3');
INSERT INTO public.song_submissions (id, kind, video_id, title, segments, ip_hash, user_id)
VALUES ('00000000-0000-0000-0000-00000000d003', 'new', 'u6u6u6u6u6u', 'u6 歌回', '[{"start":0}]', 'u6-ip-hash-0123456789', '00000000-0000-0000-0000-0000000000c3');
INSERT INTO public.feedbacks (id, feedback_type, content, user_id)
VALUES ('00000000-0000-0000-0000-00000000d004', 'bug', 'u6 意見', '00000000-0000-0000-0000-0000000000c3');

DO $$
BEGIN
  IF (SELECT count(*) FROM (
        SELECT user_id FROM public.vtuber_contributions WHERE id = '00000000-0000-0000-0000-00000000d001'
        UNION ALL SELECT user_id FROM public.vtuber_reports WHERE id = '00000000-0000-0000-0000-00000000d002'
        UNION ALL SELECT user_id FROM public.song_submissions WHERE id = '00000000-0000-0000-0000-00000000d003'
        UNION ALL SELECT user_id FROM public.feedbacks WHERE id = '00000000-0000-0000-0000-00000000d004'
      ) t WHERE user_id = '00000000-0000-0000-0000-0000000000c3') <> 4 THEN
    RAISE EXCEPTION 'U6 前置失敗：四張表的 user_id 沒有寫進去';
  END IF;
END $$;

DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-0000000000c3';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.vtuber_contributions WHERE id = '00000000-0000-0000-0000-00000000d001' AND user_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'U6 失敗：vtuber_contributions 刪帳號後列消失或 user_id 沒設 null'; END IF;
  SELECT count(*) INTO n FROM public.vtuber_reports WHERE id = '00000000-0000-0000-0000-00000000d002' AND user_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'U6 失敗：vtuber_reports 刪帳號後列消失或 user_id 沒設 null'; END IF;
  SELECT count(*) INTO n FROM public.song_submissions WHERE id = '00000000-0000-0000-0000-00000000d003' AND user_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'U6 失敗：song_submissions 刪帳號後列消失或 user_id 沒設 null'; END IF;
  SELECT count(*) INTO n FROM public.feedbacks WHERE id = '00000000-0000-0000-0000-00000000d004' AND user_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'U6 失敗：feedbacks 刪帳號後列消失或 user_id 沒設 null'; END IF;
END $$;

-- ========== U7：我的投稿只看得到自己的 ==========
-- A（c1）：四張表各 1 筆（最新）＋ 55 筆舊意見；B（c2）：四張表各 1 筆
INSERT INTO public.vtuber_contributions (id, action, payload, status, user_id, submitted_by, submitter_contact, ip_hash, reviewer_notes, created_at)
VALUES ('00000000-0000-0000-0000-00000000a001', 'add', '{}', 'pending', '00000000-0000-0000-0000-0000000000c1', 'user', 'secret-contact-a', 'iphash-a', 'secret-note-a', now() - interval '1 minute'),
       ('00000000-0000-0000-0000-00000000b001', 'add', '{}', 'pending', '00000000-0000-0000-0000-0000000000c2', 'user', 'secret-contact-b', 'iphash-b', 'secret-note-b', now() - interval '1 minute');
INSERT INTO public.vtuber_reports (id, kind, user_id, contact, ip_hash, admin_notes, created_at)
VALUES ('00000000-0000-0000-0000-00000000a002', 'missing_vtuber', '00000000-0000-0000-0000-0000000000c1', 'secret-contact-a', 'iphash-a', 'secret-note-a', now() - interval '2 minutes'),
       ('00000000-0000-0000-0000-00000000b002', 'missing_vtuber', '00000000-0000-0000-0000-0000000000c2', 'secret-contact-b', 'iphash-b', 'secret-note-b', now() - interval '2 minutes');
INSERT INTO public.song_submissions (id, kind, video_id, title, segments, ip_hash, user_id, submitter_contact, reviewer_notes, created_at)
VALUES ('00000000-0000-0000-0000-00000000a003', 'new', 'aaaaaaaaaaa', 'A 的歌回', '[{"start":0}]', 'iphash-a-0123456789', '00000000-0000-0000-0000-0000000000c1', 'secret-contact-a', 'secret-note-a', now() - interval '3 minutes'),
       ('00000000-0000-0000-0000-00000000b003', 'new', 'bbbbbbbbbbb', 'B 的歌回', '[{"start":0}]', 'iphash-b-0123456789', '00000000-0000-0000-0000-0000000000c2', 'secret-contact-b', 'secret-note-b', now() - interval '3 minutes');
INSERT INTO public.feedbacks (id, feedback_type, content, user_id, admin_notes, created_at)
VALUES ('00000000-0000-0000-0000-00000000a004', 'bug', 'A 的意見', '00000000-0000-0000-0000-0000000000c1', 'secret-note-a', now() - interval '4 minutes'),
       ('00000000-0000-0000-0000-00000000b004', 'bug', 'B 的意見', '00000000-0000-0000-0000-0000000000c2', 'secret-note-b', now() - interval '4 minutes');

-- 以「已登入的 A」身分呼叫
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal1"}', true);

DO $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(id ORDER BY created_at DESC) INTO ids FROM public.my_submissions();
  IF ids IS NULL OR ids <> ARRAY[
       '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002',
       '00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a004']::uuid[] THEN
    RAISE EXCEPTION 'U7 失敗：A 應只看到自己的四筆（新到舊），得到 %', ids;
  END IF;
END $$;

-- 回傳欄位只有五個，且沒有任何敏感內容
DO $$
DECLARE cols text[]; leaked int;
BEGIN
  SELECT array_agg(k ORDER BY k) INTO cols
    FROM (SELECT DISTINCT jsonb_object_keys(to_jsonb(m)) AS k FROM public.my_submissions() m) s;
  IF cols IS DISTINCT FROM ARRAY['created_at', 'id', 'kind', 'status', 'title'] THEN
    RAISE EXCEPTION 'U7 失敗：回傳欄位應只有 kind/id/created_at/status/title，得到 %', cols;
  END IF;
  SELECT count(*) INTO leaked FROM public.my_submissions() m WHERE to_jsonb(m)::text ~ 'secret-|iphash'
    OR to_jsonb(m)::text LIKE '%contact%' OR to_jsonb(m)::text LIKE '%ip_hash%';
  IF leaked <> 0 THEN RAISE EXCEPTION 'U7 失敗：回傳內容洩漏 contact／ip_hash／備註'; END IF;
END $$;

-- 換成 B：只看到 B 的
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","aal":"aal1"}', true);
DO $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(id) INTO ids FROM public.my_submissions();
  IF ids IS NULL OR cardinality(ids) <> 4 OR NOT (ids <@ ARRAY[
       '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b002',
       '00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-00000000b004']::uuid[]) THEN
    RAISE EXCEPTION 'U7 失敗：B 應只看到自己的四筆，得到 %', ids;
  END IF;
END $$;

-- 沒登入身分（auth.uid() 為 null）：什麼都看不到
SELECT set_config('request.jwt.claims', '', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.my_submissions()) <> 0 THEN
    RAISE EXCEPTION 'U7 失敗：沒有登入身分時不應回傳任何列';
  END IF;
END $$;

-- 上限 50 筆、新到舊：A 另有 55 筆更舊的意見（共 59 筆）
RESET ROLE;
INSERT INTO public.feedbacks (feedback_type, content, user_id, created_at)
SELECT 'other', 'A 的舊意見 ' || g, '00000000-0000-0000-0000-0000000000c1', now() - interval '1 day' - make_interval(mins => g)
FROM generate_series(1, 55) g;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal1"}', true);
DO $$
DECLARE n int; ts timestamptz[]; sorted timestamptz[]; newest uuid[];
BEGIN
  SELECT count(*) INTO n FROM public.my_submissions();
  IF n <> 50 THEN RAISE EXCEPTION 'U7 失敗：最多回 50 筆，得到 %', n; END IF;
  SELECT array_agg(created_at ORDER BY created_at DESC) INTO sorted FROM public.my_submissions();
  SELECT array_agg(created_at) INTO ts FROM (SELECT created_at FROM public.my_submissions()) x;
  -- 函式回傳順序本身要是新到舊（不靠外層排序）：與排序後相同
  IF ts IS DISTINCT FROM sorted THEN RAISE EXCEPTION 'U7 失敗：回傳順序不是新到舊'; END IF;
  SELECT array_agg(id) INTO newest FROM (SELECT id FROM public.my_submissions() LIMIT 4) y;
  IF NOT (newest @> ARRAY[
       '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002',
       '00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a004']::uuid[]) THEN
    RAISE EXCEPTION 'U7 失敗：最新的四筆應排在最前面，得到 %', newest;
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ========== U8（SQL 部分）：問卷答案歸到帳號 ==========
INSERT INTO public.announcements (id, type, title, status) VALUES
  ('00000000-0000-0000-0000-00000000e001', 'poll', 'a1', 'published'),
  ('00000000-0000-0000-0000-00000000e002', 'poll', 'a2', 'published'),
  ('00000000-0000-0000-0000-00000000e003', 'poll', 'a3', 'published'),
  ('00000000-0000-0000-0000-00000000e004', 'poll', 'a4', 'published');

-- 這台裝置 D 的匿名答案：a1（可認領）、a2（帳號 A 已作答 → 跳過）、a4 是帳號 B 帶著同裝置的答案（不可動）
-- 另一台裝置 E 的匿名答案 a3（不可動）
INSERT INTO public.announcement_responses (id, announcement_id, user_id, device_id, choices) VALUES
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', NULL, 'dev-D', '["x"]'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e002', NULL, 'dev-D', '["anon"]'),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000c1', NULL, '["mine"]'),
  ('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-00000000e003', NULL, 'dev-E', '["y"]'),
  ('00000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-0000000000c2', 'dev-D', '["b"]');

DO $$
DECLARE n int;
BEGIN
  -- 以 postgres 身分執行（等同 service_role 的權限範圍）
  n := public.claim_announcement_responses('00000000-0000-0000-0000-0000000000c1', 'dev-D');
  IF n <> 1 THEN RAISE EXCEPTION 'U8 失敗：應只認領 1 筆（a1），得到 %', n; END IF;

  IF (SELECT user_id FROM public.announcement_responses WHERE id = '00000000-0000-0000-0000-00000000f001') IS DISTINCT FROM '00000000-0000-0000-0000-0000000000c1'::uuid THEN
    RAISE EXCEPTION 'U8 失敗：a1 的匿名答案沒有改成帳號 A';
  END IF;
  -- 已作答的公告不覆蓋：帳號原本的答案不變，匿名那筆維持匿名
  IF (SELECT choices::text FROM public.announcement_responses WHERE id = '00000000-0000-0000-0000-00000000f003') <> '["mine"]' THEN
    RAISE EXCEPTION 'U8 失敗：帳號已有的答案被覆蓋';
  END IF;
  IF (SELECT user_id FROM public.announcement_responses WHERE id = '00000000-0000-0000-0000-00000000f002') IS NOT NULL THEN
    RAISE EXCEPTION 'U8 失敗：帳號已作答的公告，匿名答案不應被改成帳號';
  END IF;
  -- 別台裝置、別的帳號的答案不動
  IF (SELECT user_id FROM public.announcement_responses WHERE id = '00000000-0000-0000-0000-00000000f004') IS NOT NULL THEN
    RAISE EXCEPTION 'U8 失敗：別台裝置的匿名答案被認領';
  END IF;
  IF (SELECT user_id FROM public.announcement_responses WHERE id = '00000000-0000-0000-0000-00000000f005') IS DISTINCT FROM '00000000-0000-0000-0000-0000000000c2'::uuid THEN
    RAISE EXCEPTION 'U8 失敗：別的帳號的答案被改動';
  END IF;

  -- 再認領一次：沒有東西可改，回 0 且不報錯
  n := public.claim_announcement_responses('00000000-0000-0000-0000-0000000000c1', 'dev-D');
  IF n <> 0 THEN RAISE EXCEPTION 'U8 失敗：重複認領應回 0，得到 %', n; END IF;
END $$;

-- 只有 service_role 能執行
DO $$
BEGIN
  IF NOT has_function_privilege('service_role', 'public.claim_announcement_responses(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'U8 失敗：service_role 應可執行 claim_announcement_responses';
  END IF;
  IF has_function_privilege('authenticated', 'public.claim_announcement_responses(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'U8 失敗：authenticated 不應有 claim_announcement_responses 的執行權限';
  END IF;
  IF has_function_privilege('anon', 'public.claim_announcement_responses(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'U8 失敗：anon 不應有 claim_announcement_responses 的執行權限';
  END IF;
END $$;

-- authenticated 實際呼叫要被拒（不能替別人認領）
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","aal":"aal1"}', true);
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.claim_announcement_responses('00000000-0000-0000-0000-0000000000c2', 'dev-E');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'U8 失敗：authenticated 呼叫 claim_announcement_responses 沒有被拒'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- 被拒的呼叫沒有改到資料
DO $$
BEGIN
  IF (SELECT user_id FROM public.announcement_responses WHERE id = '00000000-0000-0000-0000-00000000f004') IS NOT NULL THEN
    RAISE EXCEPTION 'U8 失敗：被拒的呼叫仍改動了資料';
  END IF;
END $$;

ROLLBACK;
