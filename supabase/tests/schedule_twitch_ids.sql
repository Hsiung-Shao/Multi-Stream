-- schedule_twitch_ids／schedule_twitch_resolve（migration 20261110064423）的名冊過濾與權限測試。
-- 要與原名冊 schedule_roster_v2 一致：頻道 status='active'、external_id 不為 null、實況主 activity <> 'graduate'。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/schedule_twitch_ids.sql
-- 整檔在一個交易內，結尾 ROLLBACK。斷言失敗一律 RAISE EXCEPTION。

BEGIN;

-- ───────────── 測資 ─────────────
-- a1：active 實況主，有 active Twitch 頻道（應出現）＋一筆 removed 但 external_id 與 active 相同的頻道（partial unique 允許）＋一筆 removed 且 external_id NULL
-- a2：activity='graduate' 的實況主，有 active Twitch 頻道（應排除）
INSERT INTO public.vtubers (id, name, nationality, slug, activity) VALUES
  ('a0000000-0000-4000-8000-0000000000e1', 'twitch ids 甲', 'TW', 'zz-twitch-ids-1', 'active'),
  ('a0000000-0000-4000-8000-0000000000e2', 'twitch ids 乙（畢業）', 'TW', 'zz-twitch-ids-2', 'graduate');

INSERT INTO public.vtuber_channels (id, vtuber_id, platform, external_id, handle, status) VALUES
  ('c0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000e1', 'twitch', '990000001', 'zz_tid_active', 'active'),
  ('c0000000-0000-4000-8000-0000000000e2', 'a0000000-0000-4000-8000-0000000000e1', 'twitch', '990000001', 'zz_tid_removed_same', 'removed'),
  ('c0000000-0000-4000-8000-0000000000e3', 'a0000000-0000-4000-8000-0000000000e1', 'twitch', NULL,        'zz_tid_removed_null', 'removed'),
  ('c0000000-0000-4000-8000-0000000000e4', 'a0000000-0000-4000-8000-0000000000e2', 'twitch', '990000002', 'zz_tid_graduate', 'active');

-- ───────────── ids：只含 active 且未畢業的 external_id，不含 NULL ─────────────
DO $$
DECLARE ids text[] := public.schedule_twitch_ids();
BEGIN
  IF NOT ('990000001' = ANY (ids)) THEN
    RAISE EXCEPTION 'I1 失敗：ids 應含 active 實況主的 active 頻道（990000001）';
  END IF;
  IF '990000002' = ANY (ids) THEN
    RAISE EXCEPTION 'I2 失敗：ids 不該含畢業實況主的頻道（990000002）';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ids) x WHERE x IS NULL) THEN
    RAISE EXCEPTION 'I3 失敗：ids 不該含 NULL（removed 且 external_id 為 NULL 的頻道）';
  END IF;
  -- removed 但 external_id 與 active 相同：id 只能出現一次（來自 active 那列）
  IF (SELECT count(*) FROM unnest(ids) x WHERE x = '990000001') <> 1 THEN
    RAISE EXCEPTION 'I4 失敗：990000001 應只出現一次（removed 的同值列不該算進來），實得 % 次', (SELECT count(*) FROM unnest(ids) x WHERE x = '990000001');
  END IF;
  -- 與原名冊（schedule_roster_v2 twitch）逐一對照：id 集合必須相同
  IF EXISTS (
    (SELECT unnest(ids) EXCEPT SELECT r->>2 FROM json_array_elements(public.schedule_roster_v2('twitch')->'rows') r)
    UNION ALL
    (SELECT r->>2 FROM json_array_elements(public.schedule_roster_v2('twitch')->'rows') r EXCEPT SELECT unnest(ids))
  ) THEN
    RAISE EXCEPTION 'I5 失敗：ids 的集合與 schedule_roster_v2(''twitch'') 不一致';
  END IF;
END $$;

-- ───────────── resolve：graduate／removed 回 0 列，active 回剛好 1 列 ─────────────
DO $$
DECLARE n int; r record;
BEGIN
  SELECT count(*) INTO n FROM public.schedule_twitch_resolve(ARRAY['990000002']);
  IF n <> 0 THEN RAISE EXCEPTION 'R1 失敗：畢業實況主的 id 應回 0 列，實得 %', n; END IF;

  SELECT count(*) INTO n FROM public.schedule_twitch_resolve(ARRAY['990000001']);
  IF n <> 1 THEN RAISE EXCEPTION 'R2 失敗：active 的 id 應回剛好 1 列（removed 同值列不該一起回），實得 %', n; END IF;

  SELECT * INTO r FROM public.schedule_twitch_resolve(ARRAY['990000001']);
  IF r.id <> 'c0000000-0000-4000-8000-0000000000e1'::uuid OR r.vtuber_id <> 'a0000000-0000-4000-8000-0000000000e1'::uuid OR r.external_id <> '990000001' THEN
    RAISE EXCEPTION 'R3 失敗：應回 active 那列（e1），實得 % / % / %', r.id, r.vtuber_id, r.external_id;
  END IF;

  -- removed 且 external_id 為 NULL 的頻道：傳 NULL 元素也不該回列
  SELECT count(*) INTO n FROM public.schedule_twitch_resolve(ARRAY[NULL, '990000002']::text[]);
  IF n <> 0 THEN RAISE EXCEPTION 'R4 失敗：傳入 NULL／畢業 id 應回 0 列，實得 %', n; END IF;
END $$;

-- 只有 removed 的 external_id：把 active 那列也改成 removed 後，該 id 應完全消失
UPDATE public.vtuber_channels SET status = 'removed', external_id = NULL WHERE id = 'c0000000-0000-4000-8000-0000000000e1';
UPDATE public.vtuber_channels SET external_id = '990000003' WHERE id = 'c0000000-0000-4000-8000-0000000000e2'; -- removed 但有值
DO $$
BEGIN
  IF '990000003' = ANY (public.schedule_twitch_ids()) THEN
    RAISE EXCEPTION 'I6 失敗：removed 頻道（990000003）不該出現在 ids';
  END IF;
  IF (SELECT count(*) FROM public.schedule_twitch_resolve(ARRAY['990000003'])) <> 0 THEN
    RAISE EXCEPTION 'R5 失敗：removed 頻道（990000003）resolve 應回 0 列';
  END IF;
END $$;

-- ───────────── 權限：anon 一律 42501 ─────────────
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.schedule_twitch_ids();
  RAISE EXCEPTION 'P1 失敗：anon 可以呼叫 schedule_twitch_ids';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM * FROM public.schedule_twitch_resolve(ARRAY['990000001']);
  RAISE EXCEPTION 'P2 失敗：anon 可以呼叫 schedule_twitch_resolve';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

\echo 'schedule_twitch_ids：全部通過'
ROLLBACK;
