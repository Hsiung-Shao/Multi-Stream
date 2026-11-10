-- schedule_merge_apply（一次 RPC 在資料庫端算合併、寫入、過期）的行為與權限測試。
-- 規則來源：migration 20261110080000_schedule_merge_apply.sql（merge.ts 已刪除）。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/schedule_merge_apply.sql
-- 整檔在一個交易內，結尾 ROLLBACK。斷言失敗一律 RAISE EXCEPTION；斷言只看自己的 zz 測資列。

BEGIN;

-- ───────────── 測資 ─────────────
-- 一個情境一位實況主（編號 mm＝01..60；01..10 為 M 系列、11..50 為由 TS 搬來的 D/C/T/E 系列），各有 YouTube／Twitch 頻道各一
-- ID 規則：vtuber a…mm、YT 頻道 b…mm、Twitch 頻道 c…mm、場次 d…mmkk（k＝該情境第幾列）
CREATE FUNCTION pg_temp.zz_tpe() RETURNS timestamptz LANGUAGE sql STABLE AS
  $$ SELECT date_trunc('day', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei' $$;

-- 由 TS 搬來的案例用的小工具：zz_id(m,k)＝場次 id、zz_ins＝在實況主 m 插一列（頻道依平台）、zz_chk＝斷言 merged_with 指向同情境第 want_k 列（NULL＝不併）與狀態
CREATE FUNCTION pg_temp.zz_id(m int, k int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $$ SELECT format('d0000000-0000-4000-8000-%s', lpad(lpad(m::text, 2, '0') || lpad(k::text, 2, '0'), 12, '0'))::uuid $$;
CREATE FUNCTION pg_temp.zz_d0() RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$ SELECT '2026-09-29T12:00:00Z'::timestamptz $$;
CREATE FUNCTION pg_temp.zz_c0() RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$ SELECT '2026-10-06T12:00:00Z'::timestamptz $$;

-- created 預設一個很早的日期：TS 原測資「沒有寫入時間」＝沒有兌現下限，SQL 的 created_at 不能為 null，用早於所有測資的日期等效
CREATE FUNCTION pg_temp.zz_ins(m int, k int, platform text, ext text, source text, status text, sched timestamptz,
                               astart timestamptz DEFAULT NULL, aend timestamptz DEFAULT NULL, tbd boolean DEFAULT false,
                               announced timestamptz DEFAULT NULL, created timestamptz DEFAULT '2026-10-01T00:00:00Z', frame boolean DEFAULT false)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.streams (id, vtuber_id, channel_id, platform, external_id, source, status, scheduled_start, actual_start, actual_end, time_tbd, announced_at, created_at, is_schedule_frame)
  VALUES (pg_temp.zz_id(m, k), format('a0000000-0000-4000-8000-0000000000%s', lpad(m::text, 2, '0'))::uuid,
          CASE platform WHEN 'youtube' THEN format('b0000000-0000-4000-8000-0000000000%s', lpad(m::text, 2, '0'))::uuid
                        ELSE format('c0000000-0000-4000-8000-0000000000%s', lpad(m::text, 2, '0'))::uuid END,
          platform, ext, source, status, sched, astart, aend, tbd, announced, created, frame)
$$;

CREATE FUNCTION pg_temp.zz_chk(title text, m int, k int, want_k int, want_status text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s record; want uuid := CASE WHEN want_k IS NULL THEN NULL ELSE pg_temp.zz_id(m, want_k) END;
BEGIN
  SELECT merged_with, status INTO s FROM public.streams WHERE id = pg_temp.zz_id(m, k);
  IF s.merged_with IS DISTINCT FROM want OR (want_status IS NOT NULL AND s.status <> want_status) THEN
    RAISE EXCEPTION '% 失敗：期望 merged_with＝第 % 列、狀態 %，實得 merged_with＝第 % 列、狀態 %', title, want_k, coalesce(want_status, '(不檢查)'),
      (SELECT k2 FROM generate_series(1, 9) k2 WHERE pg_temp.zz_id(m, k2) = s.merged_with), s.status;
  END IF;
  RAISE NOTICE '通過：%', title;
END $$;

INSERT INTO public.vtubers (id, name, nationality, slug)
SELECT format('a0000000-0000-4000-8000-0000000000%s', lpad(i::text, 2, '0'))::uuid, 'merge zz ' || i, 'TW', 'zz-merge-apply-' || i
  FROM generate_series(1, 60) i;

INSERT INTO public.vtuber_channels (id, vtuber_id, platform, external_id, handle)
SELECT format('b0000000-0000-4000-8000-0000000000%s', lpad(i::text, 2, '0'))::uuid,
       format('a0000000-0000-4000-8000-0000000000%s', lpad(i::text, 2, '0'))::uuid,
       'youtube', 'UCzzMergeApply' || lpad(i::text, 10, '0'), '@zzmerge' || i
  FROM generate_series(1, 60) i;
INSERT INTO public.vtuber_channels (id, vtuber_id, platform, external_id, handle)
SELECT format('c0000000-0000-4000-8000-0000000000%s', lpad(i::text, 2, '0'))::uuid,
       format('a0000000-0000-4000-8000-0000000000%s', lpad(i::text, 2, '0'))::uuid,
       'twitch', 'zz_merge_apply_tw' || i, 'zz_merge_apply_tw' || i
  FROM generate_series(1, 60) i;

INSERT INTO public.streams (id, vtuber_id, channel_id, platform, external_id, source, status, scheduled_start, actual_start, actual_end, time_tbd, announced_at, is_schedule_frame)
SELECT v.id::uuid, format('a0000000-0000-4000-8000-0000000000%s', lpad(v.m::text, 2, '0'))::uuid,
       CASE v.platform WHEN 'youtube' THEN format('b0000000-0000-4000-8000-0000000000%s', lpad(v.m::text, 2, '0'))::uuid
                       ELSE format('c0000000-0000-4000-8000-0000000000%s', lpad(v.m::text, 2, '0'))::uuid END,
       v.platform, v.external_id, v.source, v.status, v.scheduled_start, v.actual_start, v.actual_end, v.time_tbd, v.announced_at, v.is_schedule_frame
  FROM (VALUES
  -- M1：YT 待機室（now）與 Twitch 直播（10 分鐘前開台）→ 待機室併入直播
  ('d0000000-0000-4000-8000-000000000101', 1, 'youtube', 'zzM1yt', 'yt_waiting_room', 'scheduled', now(), NULL::timestamptz, NULL::timestamptz, false, NULL::timestamptz, false),
  ('d0000000-0000-4000-8000-000000000102', 1, 'twitch',  'zz-m1-tw', 'twitch_live', 'live', NULL, now() - interval '10 minutes', NULL, false, NULL, false),
  -- M2：相差 31 分鐘 → 不合併
  ('d0000000-0000-4000-8000-000000000201', 2, 'youtube', 'zzM2yt', 'yt_waiting_room', 'scheduled', now(), NULL, NULL, false, NULL, false),
  ('d0000000-0000-4000-8000-000000000202', 2, 'twitch',  'zz-m2-tw', 'twitch_live', 'live', NULL, now() - interval '31 minutes', NULL, false, NULL, false),
  -- M3：同平台同來源兩個 YT 待機室 → 不合併
  ('d0000000-0000-4000-8000-000000000301', 3, 'youtube', 'zzM3yta', 'yt_waiting_room', 'scheduled', now(), NULL, NULL, false, NULL, false),
  ('d0000000-0000-4000-8000-000000000302', 3, 'youtube', 'zzM3ytb', 'yt_waiting_room', 'scheduled', now() + interval '5 minutes', NULL, NULL, false, NULL, false),
  -- M4：Twitch 週表併入 Twitch 直播
  ('d0000000-0000-4000-8000-000000000401', 4, 'twitch', 'zz-m4-sched', 'twitch_schedule', 'scheduled', now(), NULL, NULL, false, NULL, false),
  ('d0000000-0000-4000-8000-000000000402', 4, 'twitch', 'zz-m4-live', 'twitch_live', 'live', NULL, now() - interval '5 minutes', NULL, false, NULL, false),
  -- M5：時間未定社群列（台北當天 00:00）併入同台北日的真實場次（當天 02:00，晚於發文時間）
  ('d0000000-0000-4000-8000-000000000501', 5, 'youtube', 'zzM5yt', 'yt_waiting_room', 'scheduled', pg_temp.zz_tpe() + interval '2 hours', NULL, NULL, false, NULL, false),
  ('d0000000-0000-4000-8000-000000000502', 5, 'youtube', 'post:zz-x:1', 'community_post', 'scheduled', pg_temp.zz_tpe(), NULL, NULL, true, pg_temp.zz_tpe(), false),
  -- M6：主場次（當天 01:00）早於 tbd 列的發文時間（當天 05:00）→ 不兌現
  ('d0000000-0000-4000-8000-000000000601', 6, 'youtube', 'zzM6yt', 'yt_waiting_room', 'scheduled', pg_temp.zz_tpe() + interval '1 hour', NULL, NULL, false, NULL, false),
  ('d0000000-0000-4000-8000-000000000602', 6, 'youtube', 'post:zz-m6:1', 'community_post', 'scheduled', pg_temp.zz_tpe(), NULL, NULL, true, pg_temp.zz_tpe() + interval '5 hours', false),
  -- M7：同來源鍵（post:zz-y）同台北日已有具體時間列（:2，當天 20:00）→ tbd 列（:1）不參與合併、不過期
  ('d0000000-0000-4000-8000-000000000701', 7, 'youtube', 'zzM7yt', 'yt_waiting_room', 'scheduled', pg_temp.zz_tpe() + interval '2 hours', NULL, NULL, false, NULL, false),
  ('d0000000-0000-4000-8000-000000000702', 7, 'youtube', 'post:zz-y:1', 'community_post', 'scheduled', pg_temp.zz_tpe(), NULL, NULL, true, pg_temp.zz_tpe(), false),
  ('d0000000-0000-4000-8000-000000000703', 7, 'youtube', 'post:zz-y:2', 'community_post', 'scheduled', pg_temp.zz_tpe() + interval '20 hours', NULL, NULL, false, pg_temp.zz_tpe(), false),
  -- M8：tbd 列選到的主場次已 ended（結束時間在 p_ended_since 之後）→ tbd 列過期
  ('d0000000-0000-4000-8000-000000000801', 8, 'twitch',  'zz-m8-ended', 'twitch_live', 'ended', NULL, pg_temp.zz_tpe() + interval '2 hours', now(), false, NULL, false),
  ('d0000000-0000-4000-8000-000000000802', 8, 'youtube', 'post:zz-m8:1', 'community_post', 'scheduled', pg_temp.zz_tpe(), NULL, NULL, true, pg_temp.zz_tpe(), false),
  -- M9：常駐框（is_schedule_frame）與同時段 Twitch 直播 → 框列 merged_with 不變（維持 null）
  ('d0000000-0000-4000-8000-000000000901', 9, 'youtube', 'zzM9frame', 'yt_waiting_room', 'scheduled', now(), NULL, NULL, false, NULL, true),
  ('d0000000-0000-4000-8000-000000000902', 9, 'twitch',  'zz-m9-tw', 'twitch_live', 'live', NULL, now() - interval '5 minutes', NULL, false, NULL, false),
  -- M10：dry run（配置同 M1）
  ('d0000000-0000-4000-8000-000000001001', 10, 'youtube', 'zzM10yt', 'yt_waiting_room', 'scheduled', now(), NULL, NULL, false, NULL, false),
  ('d0000000-0000-4000-8000-000000001002', 10, 'twitch',  'zz-m10-tw', 'twitch_live', 'live', NULL, now() - interval '10 minutes', NULL, false, NULL, false)
  ) AS v(id, m, platform, external_id, source, status, scheduled_start, actual_start, actual_end, time_tbd, announced_at, is_schedule_frame);

\echo '測資建立完成'

-- ───────────── M10 dry run：回傳含預期變更、表內不動 ─────────────
DO $$
DECLARE r json;
BEGIN
  r := public.schedule_merge_apply(now() - interval '12 hours', pg_temp.zz_tpe() - interval '1 day', true);
  IF NOT EXISTS (SELECT 1 FROM json_array_elements(r->'changes') c
                  WHERE c->>'id' = 'd0000000-0000-4000-8000-000000001001' AND c->>'merged_with' = 'd0000000-0000-4000-8000-000000001002') THEN
    RAISE EXCEPTION 'M10 失敗：dry run 回傳的 changes 應含 M10 待機室 → 直播，實得 %', r->'changes';
  END IF;
  IF (r->>'changed')::int < 1 THEN
    RAISE EXCEPTION 'M10 失敗：dry run 的 changed 應 >= 1，實得 %', r->>'changed';
  END IF;
  IF (r->>'changed')::int <> json_array_length(r->'changes') OR (r->>'expired')::int <> json_array_length(r->'expire') THEN
    RAISE EXCEPTION 'M10 失敗：dry run 的 changed／expired 應等於 changes／expire 長度，實得 %', r::text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.streams WHERE id = 'd0000000-0000-4000-8000-000000001001' AND merged_with IS NOT NULL) THEN
    RAISE EXCEPTION 'M10 失敗：dry run 不該寫入 merged_with';
  END IF;
  IF EXISTS (SELECT 1 FROM public.streams WHERE id = 'd0000000-0000-4000-8000-000000000802' AND status <> 'scheduled') THEN
    RAISE EXCEPTION 'M10 失敗：dry run 不該過期任何列';
  END IF;
END $$;

-- ───────────── 真的套用 ─────────────
CREATE TEMP TABLE zz_apply_result AS
  SELECT public.schedule_merge_apply(now() - interval '12 hours', pg_temp.zz_tpe() - interval '1 day') AS r;

DO $$
DECLARE r json := (SELECT r FROM zz_apply_result);
  tbd_status text; mw uuid;
BEGIN
  -- M1
  IF (SELECT merged_with FROM public.streams WHERE id = 'd0000000-0000-4000-8000-000000000101') IS DISTINCT FROM 'd0000000-0000-4000-8000-000000000102'::uuid THEN
    RAISE EXCEPTION 'M1 失敗：YT 待機室應併入同時段 Twitch 直播';
  END IF;
  IF (SELECT merged_with FROM public.streams WHERE id = 'd0000000-0000-4000-8000-000000000102') IS NOT NULL THEN
    RAISE EXCEPTION 'M1 失敗：Twitch 直播是主場次，merged_with 應為 null';
  END IF;
  -- M2
  IF EXISTS (SELECT 1 FROM public.streams WHERE id IN ('d0000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000202') AND merged_with IS NOT NULL) THEN
    RAISE EXCEPTION 'M2 失敗：相差 31 分鐘不該合併';
  END IF;
  -- M3
  IF EXISTS (SELECT 1 FROM public.streams WHERE id IN ('d0000000-0000-4000-8000-000000000301', 'd0000000-0000-4000-8000-000000000302') AND merged_with IS NOT NULL) THEN
    RAISE EXCEPTION 'M3 失敗：同平台同來源的兩個待機室不該合併';
  END IF;
  -- M4
  IF (SELECT merged_with FROM public.streams WHERE id = 'd0000000-0000-4000-8000-000000000401') IS DISTINCT FROM 'd0000000-0000-4000-8000-000000000402'::uuid THEN
    RAISE EXCEPTION 'M4 失敗：Twitch 週表應併入 Twitch 直播';
  END IF;
  -- M5
  IF (SELECT merged_with FROM public.streams WHERE id = 'd0000000-0000-4000-8000-000000000502') IS DISTINCT FROM 'd0000000-0000-4000-8000-000000000501'::uuid THEN
    RAISE EXCEPTION 'M5 失敗：時間未定列應併入同台北日的真實場次';
  END IF;
  -- M6
  IF (SELECT merged_with FROM public.streams WHERE id = 'd0000000-0000-4000-8000-000000000602') IS NOT NULL THEN
    RAISE EXCEPTION 'M6 失敗：主場次早於發文時間，時間未定列不該兌現';
  END IF;
  -- M7
  SELECT merged_with, status INTO mw, tbd_status FROM public.streams WHERE id = 'd0000000-0000-4000-8000-000000000702';
  IF mw IS NOT NULL OR tbd_status <> 'scheduled' THEN
    RAISE EXCEPTION 'M7 失敗：同來源同日已有具體時間列，tbd 列應不合併、不過期，實得 % / %', mw, tbd_status;
  END IF;
  -- M8
  SELECT status INTO tbd_status FROM public.streams WHERE id = 'd0000000-0000-4000-8000-000000000802';
  IF tbd_status <> 'expired' THEN
    RAISE EXCEPTION 'M8 失敗：主場次已 ended，tbd 列應過期，實得 %', tbd_status;
  END IF;
  IF (r->>'expired')::int < 1 THEN
    RAISE EXCEPTION 'M8 失敗：回傳 expired 應 >= 1，實得 %', r->>'expired';
  END IF;
  -- M9
  IF (SELECT merged_with FROM public.streams WHERE id = 'd0000000-0000-4000-8000-000000000901') IS NOT NULL THEN
    RAISE EXCEPTION 'M9 失敗：常駐框的 merged_with 不該被動';
  END IF;
  -- 回傳形狀：正式執行只回 changed／expired，不帶 changes／expire 陣列（dry run 才帶）
  IF (r::jsonb) ? 'changes' OR (r::jsonb) ? 'expire' THEN
    RAISE EXCEPTION '回傳形狀失敗：正式執行不該含 changes／expire，實得 %', r::text;
  END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM json_object_keys(r) k) IS DISTINCT FROM ARRAY['changed', 'expired'] THEN
    RAISE EXCEPTION '回傳形狀失敗：正式執行應只有 changed／expired 兩個鍵，實得 %', r::text;
  END IF;
  IF json_typeof(r->'changed') <> 'number' OR json_typeof(r->'expired') <> 'number' THEN
    RAISE EXCEPTION '回傳形狀失敗：changed／expired 應為數字，實得 %', r::text;
  END IF;
END $$;

-- ───────────── 由 TS 搬來的合併規則案例（merge.ts 刪除後，SQL 是規則唯一來源）─────────────
-- 原 TS：merge_twitch.test.ts〈雙平台合併〉→ D1..D7；community_sources.test.ts 的合併相關 describe → C1..C4、T10/T11/T21..T25/E 系列。
-- 一個案例一位實況主（m＝編號）；日期沿用原 TS 的固定日期，所以改用寬鬆的 p_ended_since／p_since（2026-09-01）呼叫第二次 apply。
-- 不搬：T21「沒有 created_at 的時間未定列」（SQL 的 created_at 為 NOT NULL，情境不存在）、T26「合併讀取欄位含 announced_at…」（不再經 REST 讀欄位；
--   announced_at 優先於 created_at 由 T24a／T24b 覆蓋——created_at 晚於場次開始時仍可兌現；created_at 當後備由 T25a 覆蓋；external_id 由 T23 系列覆蓋）。
DO $$
DECLARE d0 timestamptz := pg_temp.zz_d0(); c0 timestamptz := pg_temp.zz_c0();
  tbd14 timestamptz := '2026-10-13T16:00:00Z'; at2100 timestamptz := '2026-10-14T13:00:00Z';
BEGIN
  -- D：雙平台合併
  PERFORM pg_temp.zz_ins(11, 1, 'youtube', 'zz-d1-yt',  'yt_waiting_room', 'scheduled', d0);
  PERFORM pg_temp.zz_ins(11, 2, 'twitch',  'zz-d1-tw',  'twitch_schedule', 'scheduled', d0 + interval '20 minutes');
  PERFORM pg_temp.zz_ins(12, 1, 'youtube', 'zz-d2-yt',  'yt_waiting_room', 'scheduled', d0);
  PERFORM pg_temp.zz_ins(12, 2, 'twitch',  'zz-d2-far', 'twitch_schedule', 'scheduled', d0 + interval '30 minutes 1 second');
  PERFORM pg_temp.zz_ins(12, 3, 'youtube', 'zz-d2-yt2', 'yt_waiting_room', 'scheduled', d0 - interval '5 minutes');
  PERFORM pg_temp.zz_ins(13, 1, 'twitch',  'zz-d2-other', 'twitch_schedule', 'scheduled', d0);
  PERFORM pg_temp.zz_ins(14, 1, 'twitch',  'zz-d3a-live', 'twitch_live', 'live', NULL, d0 + interval '3 minutes');
  PERFORM pg_temp.zz_ins(14, 2, 'twitch',  'zz-d3a-sched', 'twitch_schedule', 'scheduled', d0);
  PERFORM pg_temp.zz_ins(15, 1, 'youtube', 'zz-d3b-yt', 'yt_waiting_room', 'live', d0, d0);
  PERFORM pg_temp.zz_ins(15, 2, 'twitch',  'zz-d3b-live', 'twitch_live', 'live', NULL, d0 + interval '1 minute');
  PERFORM pg_temp.zz_ins(16, 1, 'youtube', 'zz-d4-yt',  'yt_waiting_room', 'scheduled', d0);
  PERFORM pg_temp.zz_ins(16, 2, 'twitch',  'zz-d4-live', 'twitch_live', 'live', NULL, d0 + interval '5 minutes');
  PERFORM pg_temp.zz_ins(17, 1, 'twitch',  'zz-d5-ended', 'twitch_live', 'ended', NULL, d0 + interval '5 minutes', d0 + interval '2 hours');
  PERFORM pg_temp.zz_ins(17, 2, 'twitch',  'zz-d5-sched', 'twitch_schedule', 'scheduled', d0);
  PERFORM pg_temp.zz_ins(18, 1, 'youtube', 'zz-d6-yta', 'yt_waiting_room', 'scheduled', d0);
  PERFORM pg_temp.zz_ins(18, 2, 'youtube', 'zz-d6-ytb', 'yt_waiting_room', 'scheduled', d0 + interval '50 minutes');
  PERFORM pg_temp.zz_ins(18, 3, 'twitch',  'zz-d6-tw',  'twitch_schedule', 'scheduled', d0 + interval '40 minutes');
  PERFORM pg_temp.zz_ins(18, 4, 'youtube', 'zz-d6-frame', 'yt_waiting_room', 'scheduled', d0, frame => true);
  PERFORM pg_temp.zz_ins(18, 5, 'youtube', 'zz-d6-ended', 'yt_waiting_room', 'ended', d0, NULL, d0 + interval '2 hours');
  PERFORM pg_temp.zz_ins(19, 1, 'youtube', 'zz-d7-yt', 'yt_waiting_room', 'scheduled', d0);
  PERFORM pg_temp.zz_ins(19, 2, 'twitch',  'zz-d7-tw', 'twitch_schedule', 'scheduled', d0);
  PERFORM pg_temp.zz_ins(20, 1, 'twitch',  'zz-d7-old', 'twitch_schedule', 'scheduled', d0);
  UPDATE public.streams SET merged_with = pg_temp.zz_id(19, 1) WHERE id IN (pg_temp.zz_id(19, 2), pg_temp.zz_id(20, 1)); -- 19.2 已正確；20.1 是別人的 → 要解除

  -- C：社群週表場次的合併
  PERFORM pg_temp.zz_ins(21, 1, 'youtube', 'zz-c1-w', 'yt_waiting_room', 'scheduled', c0);
  PERFORM pg_temp.zz_ins(21, 2, 'youtube', 'post:zz-c1:1', 'community_post', 'scheduled', c0 + interval '10 minutes');
  PERFORM pg_temp.zz_ins(22, 1, 'twitch',  'zz-c2-live', 'twitch_live', 'live', NULL, c0);
  PERFORM pg_temp.zz_ins(22, 2, 'youtube', 'post:zz-c2:1', 'community_post', 'scheduled', c0);
  PERFORM pg_temp.zz_ins(23, 1, 'youtube', 'post:zz-c3a:1', 'community_post', 'scheduled', c0);
  PERFORM pg_temp.zz_ins(23, 2, 'youtube', 'sub:zz-c3b:1', 'user_submission', 'scheduled', c0 + interval '5 minutes');
  PERFORM pg_temp.zz_ins(23, 3, 'youtube', 'post:zz-c3c:1', 'community_post', 'scheduled', c0 + interval '5 minutes');
  PERFORM pg_temp.zz_ins(24, 1, 'youtube', 'zz-c4-w', 'yt_waiting_room', 'scheduled', c0);
  PERFORM pg_temp.zz_ins(24, 2, 'youtube', 'post:zz-c4:1', 'community_post', 'scheduled', c0 + interval '45 minutes');

  -- T10／T11：時間未定列併入同台北日
  PERFORM pg_temp.zz_ins(25, 1, 'youtube', 'post:zz-t10a:1', 'community_post', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(25, 2, 'youtube', 'zz-t10a-w', 'yt_waiting_room', 'scheduled', '2026-10-14T13:00:00Z');
  PERFORM pg_temp.zz_ins(26, 1, 'youtube', 'sub:zz-t10b:1', 'user_submission', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(26, 2, 'youtube', 'zz-t10b-w', 'yt_waiting_room', 'scheduled', '2026-10-14T13:00:00Z');
  PERFORM pg_temp.zz_ins(27, 1, 'youtube', 'zz-t10c-w', 'yt_waiting_room', 'scheduled', '2026-10-14T13:00:00Z');
  PERFORM pg_temp.zz_ins(27, 2, 'youtube', 'post:zz-t10c:1', 'community_post', 'scheduled', tbd14); -- time_tbd=false 的 00:00 場次
  PERFORM pg_temp.zz_ins(28, 1, 'youtube', 'zz-t10d-w', 'yt_waiting_room', 'scheduled', '2026-10-14T13:00:00Z');
  PERFORM pg_temp.zz_ins(29, 1, 'youtube', 'post:zz-t10d:1', 'community_post', 'scheduled', tbd14, tbd => true); -- 不同人
  PERFORM pg_temp.zz_ins(30, 1, 'youtube', 'post:zz-t11a:1', 'community_post', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(30, 2, 'youtube', 'zz-t11a-w', 'yt_waiting_room', 'scheduled', '2026-10-14T16:10:00Z'); -- 台北 10/15 00:10
  PERFORM pg_temp.zz_ins(31, 1, 'youtube', 'post:zz-t11b:1', 'community_post', 'scheduled', '2026-10-14T16:00:00Z', tbd => true); -- 10/15 時間未定
  PERFORM pg_temp.zz_ins(31, 2, 'youtube', 'zz-t11b-w', 'yt_waiting_room', 'scheduled', '2026-10-14T15:50:00Z'); -- 台北 10/14 23:50

  -- T21／T25：以寫入時間（created_at；announced_at 為 null 時）判斷兌現
  PERFORM pg_temp.zz_ins(32, 1, 'youtube', 'post:zz-t21a:1', 'community_post', 'scheduled', tbd14, tbd => true, created => '2026-10-14T05:00:00Z');
  PERFORM pg_temp.zz_ins(32, 2, 'youtube', 'zz-t21a-w', 'yt_waiting_room', 'ended', '2026-10-14T02:00:00Z', '2026-10-14T02:00:00Z', '2026-10-14T03:00:00Z');
  PERFORM pg_temp.zz_ins(33, 1, 'youtube', 'post:zz-t21b:1', 'community_post', 'scheduled', tbd14, tbd => true, created => '2026-10-14T05:00:00Z');
  PERFORM pg_temp.zz_ins(33, 2, 'youtube', 'zz-t21b-w', 'yt_waiting_room', 'scheduled', '2026-10-14T03:00:00Z');
  PERFORM pg_temp.zz_ins(34, 1, 'youtube', 'post:zz-t25a:1', 'community_post', 'scheduled', tbd14, tbd => true, announced => NULL, created => '2026-10-14T05:00:00Z');
  PERFORM pg_temp.zz_ins(34, 2, 'youtube', 'zz-t25a-w', 'yt_waiting_room', 'ended', '2026-10-14T02:00:00Z', '2026-10-14T02:00:00Z', '2026-10-14T03:00:00Z');
  -- T22：寫入之後才開始
  PERFORM pg_temp.zz_ins(35, 1, 'youtube', 'post:zz-t22a:1', 'community_post', 'scheduled', tbd14, tbd => true, created => '2026-10-14T01:00:00Z');
  PERFORM pg_temp.zz_ins(35, 2, 'youtube', 'zz-t22a-w', 'yt_waiting_room', 'ended', '2026-10-14T12:00:00Z', '2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z');
  PERFORM pg_temp.zz_ins(36, 1, 'youtube', 'post:zz-t22b:1', 'community_post', 'scheduled', tbd14, tbd => true, created => '2026-10-14T01:00:00Z');
  PERFORM pg_temp.zz_ins(36, 2, 'youtube', 'zz-t22b-l', 'yt_waiting_room', 'live', '2026-10-14T12:00:00Z', '2026-10-14T12:00:00Z');
  PERFORM pg_temp.zz_ins(37, 1, 'youtube', 'post:zz-t22c:1', 'community_post', 'scheduled', tbd14, tbd => true, created => '2026-10-14T05:00:00Z');
  PERFORM pg_temp.zz_ins(37, 2, 'youtube', 'zz-t22c-l', 'yt_waiting_room', 'live', '2026-10-14T05:00:00Z', '2026-10-14T05:00:00Z');
  -- T24／T25：以發文時間 announced_at（發文 10/14 08:00 台北、寫入 22:00）判斷兌現
  PERFORM pg_temp.zz_ins(38, 1, 'youtube', 'post:zz-t24a:1', 'community_post', 'scheduled', tbd14, tbd => true, announced => '2026-10-14T00:00:00Z', created => '2026-10-14T14:00:00Z');
  PERFORM pg_temp.zz_ins(38, 2, 'youtube', 'zz-t24a-w', 'yt_waiting_room', 'ended', '2026-10-14T12:00:00Z', '2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z');
  PERFORM pg_temp.zz_ins(39, 1, 'youtube', 'post:zz-t24b:1', 'community_post', 'scheduled', tbd14, tbd => true, announced => '2026-10-14T00:00:00Z', created => '2026-10-14T14:00:00Z');
  PERFORM pg_temp.zz_ins(39, 2, 'youtube', 'zz-t24b-l', 'yt_waiting_room', 'live', '2026-10-14T12:00:00Z', '2026-10-14T12:00:00Z');
  PERFORM pg_temp.zz_ins(40, 1, 'youtube', 'post:zz-t25b:1', 'community_post', 'scheduled', tbd14, tbd => true, announced => '2026-10-14T00:00:00Z', created => '2026-10-14T14:00:00Z');
  PERFORM pg_temp.zz_ins(40, 2, 'youtube', 'zz-t25b-w', 'yt_waiting_room', 'ended', '2026-10-13T23:00:00Z', '2026-10-13T23:00:00Z', '2026-10-14T00:30:00Z');

  -- T23：同來源同台北日已有具體時間列（21:00）時，時間未定列不合併
  PERFORM pg_temp.zz_ins(41, 1, 'youtube', 'post:zz-t23a:1', 'community_post', 'scheduled', at2100);
  PERFORM pg_temp.zz_ins(41, 2, 'youtube', 'post:zz-t23a:2', 'community_post', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(41, 3, 'youtube', 'zz-t23a-w', 'yt_waiting_room', 'scheduled', at2100);
  PERFORM pg_temp.zz_ins(42, 1, 'youtube', 'post:zz-t23b:1', 'community_post', 'scheduled', at2100);
  PERFORM pg_temp.zz_ins(42, 2, 'youtube', 'post:zz-t23b:2', 'community_post', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(42, 3, 'youtube', 'zz-t23b-w', 'yt_waiting_room', 'ended', at2100, at2100, at2100 + interval '1 hour');
  PERFORM pg_temp.zz_ins(43, 1, 'youtube', 'post:zz-t23c:1', 'community_post', 'expired', at2100);
  PERFORM pg_temp.zz_ins(43, 2, 'youtube', 'post:zz-t23c:2', 'community_post', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(43, 3, 'youtube', 'zz-t23c-w', 'yt_waiting_room', 'scheduled', at2100);
  PERFORM pg_temp.zz_ins(44, 1, 'youtube', 'sub:zz-t23d:1', 'user_submission', 'scheduled', at2100);
  PERFORM pg_temp.zz_ins(44, 2, 'youtube', 'sub:zz-t23d:2', 'user_submission', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(44, 3, 'youtube', 'zz-t23d-w', 'yt_waiting_room', 'scheduled', at2100);
  PERFORM pg_temp.zz_ins(45, 1, 'youtube', 'post:zz-t23e-q:1', 'community_post', 'scheduled', at2100); -- 不同貼文
  PERFORM pg_temp.zz_ins(45, 2, 'youtube', 'post:zz-t23e-p:2', 'community_post', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(45, 3, 'youtube', 'zz-t23e-w', 'yt_waiting_room', 'scheduled', at2100);
  PERFORM pg_temp.zz_ins(46, 1, 'youtube', 'post:zz-t23f:1', 'community_post', 'scheduled', '2026-10-15T13:00:00Z'); -- 同篇但在別天
  PERFORM pg_temp.zz_ins(46, 2, 'youtube', 'post:zz-t23f:2', 'community_post', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(46, 3, 'youtube', 'zz-t23f-w', 'yt_waiting_room', 'scheduled', at2100);

  -- E：時間未定場次併入的主場次結束後
  PERFORM pg_temp.zz_ins(47, 1, 'twitch',  'zz-e1-live', 'twitch_live', 'ended', NULL, '2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z');
  PERFORM pg_temp.zz_ins(47, 2, 'youtube', 'post:zz-e1:1', 'community_post', 'scheduled', tbd14, tbd => true);
  UPDATE public.streams SET merged_with = pg_temp.zz_id(47, 1) WHERE id = pg_temp.zz_id(47, 2); -- 已併在直播底下，直播結束
  PERFORM pg_temp.zz_ins(48, 1, 'twitch',  'zz-e2a-live', 'twitch_live', 'live', NULL, '2026-10-14T12:00:00Z');
  PERFORM pg_temp.zz_ins(48, 2, 'youtube', 'post:zz-e2a:1', 'community_post', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(49, 1, 'youtube', 'zz-e2b-w', 'yt_waiting_room', 'scheduled', '2026-10-14T13:00:00Z');
  PERFORM pg_temp.zz_ins(49, 2, 'youtube', 'post:zz-e2b:1', 'community_post', 'scheduled', tbd14, tbd => true);
  PERFORM pg_temp.zz_ins(50, 1, 'twitch',  'zz-e3-live', 'twitch_live', 'ended', NULL, '2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z');
  PERFORM pg_temp.zz_ins(50, 2, 'youtube', 'post:zz-e3:1', 'community_post', 'scheduled', '2026-10-14T12:10:00Z'); -- 非時間未定
END $$;

-- D7 mergeChanges 只回傳和現況不同的列（含解除合併）→ 對應 apply 的 changes：19.1／19.2 已正確不出現，20.1 要解除；dry run 不寫入
DO $$
DECLARE r json := public.schedule_merge_apply('2026-09-01', '2026-09-01', true); n int; ids text[];
BEGIN
  SELECT count(*), array_agg(c->>'id') INTO n, ids FROM json_array_elements(r->'changes') c
   WHERE c->>'id' IN (pg_temp.zz_id(19, 1)::text, pg_temp.zz_id(19, 2)::text, pg_temp.zz_id(20, 1)::text);
  IF n <> 1 OR ids[1] <> pg_temp.zz_id(20, 1)::text THEN
    RAISE EXCEPTION 'D7 失敗：changes 應只含 20.1（解除合併），實得 % 筆 %', n, ids;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM json_array_elements(r->'changes') c WHERE c->>'id' = pg_temp.zz_id(20, 1)::text AND c->>'merged_with' IS NULL) THEN
    RAISE EXCEPTION 'D7 失敗：20.1 的 merged_with 應為 null';
  END IF;
  IF (SELECT merged_with FROM public.streams WHERE id = pg_temp.zz_id(20, 1)) IS DISTINCT FROM pg_temp.zz_id(19, 1) THEN
    RAISE EXCEPTION 'D7 失敗：dry run 不該寫入';
  END IF;
  IF EXISTS (SELECT 1 FROM json_array_elements(r->'changes') c
              WHERE c->>'id' IN (pg_temp.zz_id(17, 1)::text, pg_temp.zz_id(18, 4)::text, pg_temp.zz_id(18, 5)::text)) THEN
    RAISE EXCEPTION 'D5／D6 失敗：已結束的列與常駐框不該出現在 changes';
  END IF;
  RAISE NOTICE '通過：D7 dry run 的 changes 只含與現況不同的列（含解除合併）；D5／D6 已結束列與常駐框不在 changes';
END $$;

CREATE TEMP TABLE zz_apply_result2 AS SELECT public.schedule_merge_apply('2026-09-01', '2026-09-01') AS r;

DO $$
BEGIN
  PERFORM pg_temp.zz_chk('D1 YouTube 待機室與 Twitch 週表 ±30 分鐘內 → Twitch 併入 YouTube', 11, 2, 1);
  PERFORM pg_temp.zz_chk('D1 YouTube 待機室為主場次不被併', 11, 1, NULL);
  PERFORM pg_temp.zz_chk('D2 超過 30 分鐘不合併（Twitch 週表 30 分 1 秒）', 12, 2, NULL);
  PERFORM pg_temp.zz_chk('D2 同平台同來源不合併（YT 待機室 ×2）', 12, 3, NULL);
  PERFORM pg_temp.zz_chk('D2 不同人不合併', 13, 1, NULL);
  PERFORM pg_temp.zz_chk('D3 Twitch 週表遇到同人 Twitch 直播 → 預告併入直播', 14, 2, 1);
  PERFORM pg_temp.zz_chk('D3 Twitch 直播再併入同時的 YouTube 直播', 15, 2, 1);
  PERFORM pg_temp.zz_chk('D4 直播中優先於排定中：YT 待機室併入 Twitch 直播', 16, 1, 2);
  PERFORM pg_temp.zz_chk('D4 Twitch 直播不被藏起來', 16, 2, NULL);
  PERFORM pg_temp.zz_chk('D5 直播剛結束：預告仍併在已結束的直播底下', 17, 2, 1);
  PERFORM pg_temp.zz_chk('D5 已結束的列本身不寫入', 17, 1, NULL);
  PERFORM pg_temp.zz_chk('D6 次要場次挑時間最近的主場次（yt-b 而非 yt-a）', 18, 3, 2);
  PERFORM pg_temp.zz_chk('D6 常駐框不參與、merged_with 不動', 18, 4, NULL);
  PERFORM pg_temp.zz_chk('D6 已結束的 YT 列不被其他列併入、自己不寫入', 18, 5, NULL);
  PERFORM pg_temp.zz_chk('D7 已正確的列維持', 19, 2, 1);
  PERFORM pg_temp.zz_chk('D7 解除合併（不同人的 merged_with 清成 null）', 20, 1, NULL);

  PERFORM pg_temp.zz_chk('C1 同平台待機室 30 分鐘內 → 社群場次併入待機室', 21, 2, 1);
  PERFORM pg_temp.zz_chk('C1 待機室不被反向併入社群場次', 21, 1, NULL);
  PERFORM pg_temp.zz_chk('C2 Twitch 直播中把社群場次併掉', 22, 2, 1);
  PERFORM pg_temp.zz_chk('C2 直播中永遠是主場次', 22, 1, NULL);
  PERFORM pg_temp.zz_chk('C3 社群週表（a）不併入其他社群／投稿場次', 23, 1, NULL);
  PERFORM pg_temp.zz_chk('C3 使用者投稿與社群週表彼此不合併（b）', 23, 2, NULL);
  PERFORM pg_temp.zz_chk('C3 兩個社群場次也不合併（c）', 23, 3, NULL);
  PERFORM pg_temp.zz_chk('C4 超過 30 分鐘就不併', 24, 2, NULL);

  PERFORM pg_temp.zz_chk('T10 時間未定社群場次併入同人同台北日期的待機室', 25, 1, 2, 'scheduled');
  PERFORM pg_temp.zz_chk('T10 投稿來源的時間未定場次同樣併入同日待機室', 26, 1, 2, 'scheduled');
  PERFORM pg_temp.zz_chk('T10 不是時間未定的 00:00 場次仍受 30 分鐘限制', 27, 2, NULL);
  PERFORM pg_temp.zz_chk('T10 不同人的時間未定場次不併', 29, 1, NULL, 'scheduled');
  PERFORM pg_temp.zz_chk('T11 時間未定場次不併入隔天的場次', 30, 1, NULL);
  PERFORM pg_temp.zz_chk('T11 前一天深夜的待機室不併入隔天的時間未定場次', 31, 1, NULL);

  PERFORM pg_temp.zz_chk('T21 寫入前就已開始並結束的場次不讓時間未定列合併或過期', 32, 1, NULL, 'scheduled');
  PERFORM pg_temp.zz_chk('T21 排定時間早於寫入時間的待機室也不能讓時間未定列合併', 33, 1, NULL, 'scheduled');
  PERFORM pg_temp.zz_chk('T25 announced_at 為 null 時退回 created_at 判斷兌現', 34, 1, NULL, 'scheduled');
  PERFORM pg_temp.zz_chk('T22 寫入之後才開播並結束的場次讓時間未定列過期', 35, 1, 2, 'expired');
  PERFORM pg_temp.zz_chk('T22 寫入之後才開播的直播中場次讓時間未定列合併、不過期', 36, 1, 2, 'scheduled');
  PERFORM pg_temp.zz_chk('T22 開始時間剛好等於寫入時間也算兌現', 37, 1, 2, 'scheduled');

  PERFORM pg_temp.zz_chk('T24 發文後開播、寫入前已結束的場次讓時間未定列過期', 38, 1, 2, 'expired');
  PERFORM pg_temp.zz_chk('T24 發文後開播、寫入時仍在直播的場次讓時間未定列合併', 39, 1, 2, 'scheduled');
  PERFORM pg_temp.zz_chk('T25 發文前就已開始的場次不讓時間未定列兌現', 40, 1, NULL, 'scheduled');

  PERFORM pg_temp.zz_chk('T23 同篇貼文同日有 21:00 列時，該列併入待機室', 41, 1, 3);
  PERFORM pg_temp.zz_chk('T23 同篇貼文同日有 21:00 列時，時間未定列不併', 41, 2, NULL, 'scheduled');
  PERFORM pg_temp.zz_chk('T23 待機室已結束時同篇的時間未定列不會被過期', 42, 2, NULL, 'scheduled');
  PERFORM pg_temp.zz_chk('T23 同篇的具體時間列不論狀態（例如已過期）都讓時間未定列不併', 43, 2, NULL, 'scheduled');
  PERFORM pg_temp.zz_chk('T23 投稿來源（sub:<id>:<n>）同樣適用', 44, 2, NULL, 'scheduled');
  PERFORM pg_temp.zz_chk('T23 不同貼文的具體時間列不影響時間未定列合併', 45, 2, 3, 'scheduled');
  PERFORM pg_temp.zz_chk('T23 同篇的具體時間列在別天時不影響時間未定列合併', 46, 2, 3, 'scheduled');

  PERFORM pg_temp.zz_chk('E1 主場次已結束 → 時間未定場次改為 expired', 47, 2, 1, 'expired');
  PERFORM pg_temp.zz_chk('E2 主場次還是 live → 只設 merged_with、不過期', 48, 2, 1, 'scheduled');
  PERFORM pg_temp.zz_chk('E2 主場次還是 scheduled → 只設 merged_with、不過期', 49, 2, 1, 'scheduled');
  PERFORM pg_temp.zz_chk('E3 非時間未定的社群場次併入已結束的主場次 → 不過期', 50, 2, 1, 'scheduled');
END $$;

-- ───────────── M11 權限：只有 service_role 能呼叫 ─────────────
DO $$
BEGIN
  IF NOT has_function_privilege('service_role', 'public.schedule_merge_apply(timestamptz, timestamptz, boolean)', 'execute') THEN
    RAISE EXCEPTION 'M11 失敗：service_role 應可呼叫 schedule_merge_apply';
  END IF;
END $$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.schedule_merge_apply(now(), now(), true);
  RAISE EXCEPTION 'M11 失敗：anon 可以呼叫 schedule_merge_apply';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.schedule_merge_apply(now(), now(), true);
  RAISE EXCEPTION 'M11 失敗：authenticated 可以呼叫 schedule_merge_apply';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

\echo 'schedule_merge_apply：全部通過'
ROLLBACK;
