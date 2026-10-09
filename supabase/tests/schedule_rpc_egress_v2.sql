-- 排程 RPC 出口流量瘦身第二輪（migration 20261009010554）的行為與權限測試。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/schedule_rpc_egress_v2.sql
-- 整檔在一個交易內，結尾 ROLLBACK。斷言失敗一律 RAISE EXCEPTION。

BEGIN;

-- ───────────── 測資 ─────────────
-- b1：YouTube 兩個頻道（d1 T1、d2 T3）＋Twitch 一個；b2：只有一場很久以前結束的直播（孤立 ended）
INSERT INTO public.vtubers (id, name, nationality, slug) VALUES
  ('00000000-0000-4000-8000-0000000000b1', 'egress v2 甲', 'TW', 'zz-egress-v2-b1'),
  ('00000000-0000-4000-8000-0000000000b2', 'egress v2 乙', 'TW', 'zz-egress-v2-b2');

INSERT INTO public.vtuber_channels (id, vtuber_id, platform, external_id, handle) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1', 'youtube', 'UCzzEgressV2000000000001', '@zzegv2a'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000b1', 'youtube', 'UCzzEgressV2000000000002', '@zzegv2b'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000b1', 'twitch',  'zz_egress_v2_tw', 'zz_egress_v2_tw'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000b2', 'twitch',  'zz_egress_v2_tw2', 'zz_egress_v2_tw2');

INSERT INTO public.schedule_channel_state (channel_id, tier, tier_reason, rss_fail_streak) VALUES
  ('00000000-0000-4000-8000-0000000000d1', 1, 'x', 4),
  ('00000000-0000-4000-8000-0000000000d2', 3, 'x', 0);

INSERT INTO public.streams (id, vtuber_id, channel_id, platform, external_id, source, status, scheduled_start, actual_start, actual_end, title) VALUES
  -- V1：b1 一小時後的 YouTube 待機室（active）
  ('00000000-0000-4000-8000-0000000001e1', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000d1',
   'youtube', 'zzV2Strm001', 'yt_waiting_room', 'scheduled', now() + interval '1 hour', NULL, NULL, 'v2 待機'),
  -- V1：b1 社群週表（schedule_current_streams 要排除）
  ('00000000-0000-4000-8000-0000000001e2', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000d1',
   'youtube', 'post:zz-v2-1', 'community_post', 'scheduled', now() + interval '2 hours', NULL, NULL, 'v2 社群'),
  -- V5：b1 的 ended，開始時間與待機室相差 10 分鐘（有配對，可能成為主場次）
  ('00000000-0000-4000-8000-0000000001e3', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000d3',
   'twitch', 'zz-v2-paired', 'twitch_live', 'ended', NULL, now() + interval '50 minutes', now(), 'paired'),
  -- V5：b1 的 ended，開始時間與待機室相差 3 小時（窗外）
  ('00000000-0000-4000-8000-0000000001e4', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000d3',
   'twitch', 'zz-v2-far', 'twitch_live', 'ended', NULL, now() - interval '2 hours', now() - interval '1 hour', 'far'),
  -- V5：b2 只有 ended（孤立）
  ('00000000-0000-4000-8000-0000000001e5', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000d4',
   'twitch', 'zz-v2-orphan', 'twitch_live', 'ended', NULL, now() - interval '30 minutes', now(), 'orphan');

\echo '測資建立完成'

-- ───────────── V1 名冊 v2：篩選、欄式、分片繞回 ─────────────
DO $$
DECLARE r json; n integer; ids text[];
BEGIN
  -- 指定頻道：只回這兩個 YouTube 頻道，欄位不含 display_name／platform
  r := public.schedule_roster_v2('youtube', NULL, ARRAY['00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d3']::uuid[]);
  IF (r->>'total')::int <> 2 OR json_array_length(r->'rows') <> 2 THEN
    RAISE EXCEPTION 'V1 失敗：指定頻道應只回 2 個 YouTube 頻道，實得 %', r;
  END IF;
  IF (r->'cols')::text <> '["id","vtuber_id","external_id","tier","rss_fail_streak","last_new_video_at","og_checked_at","og_miss_streak"]' THEN
    RAISE EXCEPTION 'V1 失敗：YouTube 欄位不符：%', r->'cols';
  END IF;
  IF r->'rows'->0->>0 <> '00000000-0000-4000-8000-0000000000d1' OR (r->'rows'->0->>3)::int <> 1 OR (r->'rows'->0->>4)::int <> 4 THEN
    RAISE EXCEPTION 'V1 失敗：第一列應為 d1（tier 1、streak 4），實得 %', r->'rows'->0;
  END IF;

  -- 分級：tier 3 只回 d2
  r := public.schedule_roster_v2('youtube', 3::smallint, ARRAY['00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2']::uuid[]);
  IF (r->>'total')::int <> 1 OR r->'rows'->0->>0 <> '00000000-0000-4000-8000-0000000000d2' THEN
    RAISE EXCEPTION 'V1 失敗：tier=3 應只回 d2，實得 %', r;
  END IF;

  -- Twitch：只有 id、vtuber_id、external_id
  r := public.schedule_roster_v2('twitch', NULL, ARRAY['00000000-0000-4000-8000-0000000000d3']::uuid[]);
  IF (r->'cols')::text <> '["id","vtuber_id","external_id"]' OR json_array_length(r->'rows'->0) <> 3 THEN
    RAISE EXCEPTION 'V1 失敗：Twitch 欄位不符：%', r;
  END IF;

  -- 分片：與 TS [...slice(start), ...slice(0, start)].slice(0, limit) 相同（依 id 排序、繞回開頭）
  SELECT count(*) INTO n FROM public.vtuber_channels c JOIN public.vtubers v ON v.id = c.vtuber_id
   WHERE c.status = 'active' AND c.external_id IS NOT NULL AND v.activity <> 'graduate' AND c.platform = 'youtube';
  r := public.schedule_roster_v2('youtube', NULL, NULL, n + n - 1, 3); -- offset 超過總數：mod 後起點＝n−1
  IF (r->>'total')::int <> n OR (r->>'start')::int <> n - 1 OR json_array_length(r->'rows') <> LEAST(3, n) THEN
    RAISE EXCEPTION 'V1 失敗：分片 total/start/筆數不符（n=%）：total=% start=% rows=%', n, r->>'total', r->>'start', json_array_length(r->'rows');
  END IF;
  SELECT array_agg(x->>0 ORDER BY o) INTO ids FROM json_array_elements(r->'rows') WITH ORDINALITY e(x, o);
  IF ids[1] <> (SELECT c.id::text FROM public.vtuber_channels c JOIN public.vtubers v ON v.id = c.vtuber_id
                 WHERE c.status = 'active' AND c.external_id IS NOT NULL AND v.activity <> 'graduate' AND c.platform = 'youtube' ORDER BY c.id DESC LIMIT 1)
     OR ids[2] <> (SELECT c.id::text FROM public.vtuber_channels c JOIN public.vtubers v ON v.id = c.vtuber_id
                 WHERE c.status = 'active' AND c.external_id IS NOT NULL AND v.activity <> 'graduate' AND c.platform = 'youtube' ORDER BY c.id LIMIT 1) THEN
    RAISE EXCEPTION 'V1 失敗：分片應從最後一個 id 繞回第一個，實得 %', ids;
  END IF;

  BEGIN
    PERFORM public.schedule_roster_v2(NULL);
    RAISE EXCEPTION 'V1 失敗：p_platform 為 null 應報錯';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

-- ───────────── V2 共享表現況（POST 版）：排除社群週表、欄式 ─────────────
DO $$
DECLARE r json;
BEGIN
  r := public.schedule_current_streams(ARRAY['00000000-0000-4000-8000-0000000000d1']::uuid[]);
  IF json_array_length(r->'rows') <> 1 OR r->'rows'->0->>4 <> 'zzV2Strm001' THEN
    RAISE EXCEPTION 'V2 失敗：應只回 zzV2Strm001（排除 community_post），實得 %', r;
  END IF;
  IF json_array_length(public.schedule_current_streams(ARRAY[]::uuid[])->'rows') <> 0 THEN
    RAISE EXCEPTION 'V2 失敗：空清單應回空';
  END IF;
END $$;

-- ───────────── V3 頻道狀態寫入：同一 channel_id 取最後一筆 ─────────────
DO $$
DECLARE s record;
BEGIN
  PERFORM public.schedule_upsert_channel_states(jsonb_build_array(
    jsonb_build_object('channel_id', '00000000-0000-4000-8000-0000000000d2', 'rss_fail_streak', 7, 'rss_last_error', 'first'),
    jsonb_build_object('channel_id', '00000000-0000-4000-8000-0000000000d2', 'rss_fail_streak', 8, 'rss_last_error', 'last'),
    jsonb_build_object('channel_id', '00000000-0000-4000-8000-0000000000d3', 'og_miss_streak', 1),
    jsonb_build_object('channel_id', '00000000-0000-4000-8000-0000000000d3', 'og_miss_streak', 2)
  ));
  SELECT * INTO s FROM public.schedule_channel_state WHERE channel_id = '00000000-0000-4000-8000-0000000000d2';
  IF s.rss_fail_streak <> 8 OR s.rss_last_error <> 'last' OR s.tier <> 3 THEN
    RAISE EXCEPTION 'V3 失敗：既有列應取最後一筆（8／last）且 tier 保留 3，實得 %／%／%', s.rss_fail_streak, s.rss_last_error, s.tier;
  END IF;
  SELECT * INTO s FROM public.schedule_channel_state WHERE channel_id = '00000000-0000-4000-8000-0000000000d3';
  IF s.og_miss_streak <> 2 OR s.tier <> 2 THEN
    RAISE EXCEPTION 'V3 失敗：新列應取最後一筆（miss 2）、tier 2，實得 %／%', s.og_miss_streak, s.tier;
  END IF;
END $$;

-- ───────────── V4 snapshot 指紋時間量化、mark 先後 ─────────────
DO $$
DECLARE
  q timestamptz := to_timestamp(floor(extract(epoch from now()) / 1800) * 1800);
  r1 json; r2 json; r3 json;
BEGIN
  -- 同一個 30 分鐘桶內（桶頭＋1 分、＋29 分）資料沒變 → 指紋（md5 部分）相同
  r1 := public.schedule_snapshot_check(q + interval '1 minute', q + interval '1 minute' - interval '12 hours', 60);
  r2 := public.schedule_snapshot_check(q + interval '29 minutes', q + interval '29 minutes' - interval '12 hours', 60);
  IF split_part(r1->>'fingerprint', '@', 1) <> split_part(r2->>'fingerprint', '@', 1) THEN
    RAISE EXCEPTION 'V4 失敗：同一桶內指紋不同（% vs %）', r1->>'fingerprint', r2->>'fingerprint';
  END IF;
  -- 指紋帶 check 時間
  IF split_part(r1->>'fingerprint', '@', 2) !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'V4 失敗：fingerprint 應為 md5@epoch 毫秒，實得 %', r1->>'fingerprint';
  END IF;

  -- mark ＋1 分的 check → 同桶＋29 分：force 60 不強制、force 20（距 check 時間 28 分）強制
  PERFORM public.schedule_snapshot_mark(r1->>'fingerprint');
  r3 := public.schedule_snapshot_check(q + interval '29 minutes', q + interval '29 minutes' - interval '12 hours', 60);
  IF (r3->>'changed')::boolean THEN
    RAISE EXCEPTION 'V4 失敗：mark 後同桶同資料應為 changed=false（%）', r3;
  END IF;
  r3 := public.schedule_snapshot_check(q + interval '29 minutes', q + interval '29 minutes' - interval '12 hours', 20);
  IF NOT (r3->>'changed')::boolean THEN
    RAISE EXCEPTION 'V4 失敗：距 mark 的 check 時間 28 分鐘、force 20 應強制 changed=true（%）', r3;
  END IF;
  -- mark 較新的（＋29 分）→ 再來一個較早 check（＋1 分）的 mark 晚到 → 指紋作廢，下一輪必定重傳
  PERFORM public.schedule_snapshot_mark(r2->>'fingerprint');
  r3 := public.schedule_snapshot_check(q + interval '29 minutes', q + interval '29 minutes' - interval '12 hours', 60);
  IF (r3->>'changed')::boolean THEN
    RAISE EXCEPTION 'V4 失敗：mark ＋29 分後同資料應為 changed=false（%）', r3;
  END IF;
  PERFORM public.schedule_snapshot_mark(r1->>'fingerprint');
  r3 := public.schedule_snapshot_check(q + interval '29 minutes', q + interval '29 minutes' - interval '12 hours', 60);
  IF NOT (r3->>'changed')::boolean THEN
    RAISE EXCEPTION 'V4 失敗：較舊的 check 晚到 mark 後應作廢指紋（changed=true），實得 %', r3;
  END IF;
END $$;

-- ───────────── V5 合併指紋：孤立／窗外 ended 不影響、有配對的 ended 會影響 ─────────────
DO $$
DECLARE since timestamptz := now() - interval '3 hours'; f0 text; f1 text; r json;
BEGIN
  f0 := public.schedule_merge_fp(since);
  UPDATE public.streams SET actual_start = actual_start + interval '1 minute', source = 'twitch_schedule'
   WHERE id = '00000000-0000-4000-8000-0000000001e5'; -- b2 孤立 ended
  UPDATE public.streams SET actual_start = actual_start - interval '1 minute'
   WHERE id = '00000000-0000-4000-8000-0000000001e4'; -- b1 窗外 ended
  f1 := public.schedule_merge_fp(since);
  IF f0 <> f1 THEN
    RAISE EXCEPTION 'V5 失敗：孤立或窗外的 ended 變動不應改變合併指紋';
  END IF;
  UPDATE public.streams SET actual_start = actual_start + interval '1 minute'
   WHERE id = '00000000-0000-4000-8000-0000000001e3'; -- b1 有配對的 ended
  f1 := public.schedule_merge_fp(since);
  IF f0 = f1 THEN
    RAISE EXCEPTION 'V5 失敗：有配對的 ended 變動應改變合併指紋';
  END IF;

  -- merge mark：check 之後資料又變了 → 不記；沒變 → 記
  r := public.schedule_merge_check(since);
  UPDATE public.streams SET status = 'live', actual_start = now() WHERE id = '00000000-0000-4000-8000-0000000001e1';
  PERFORM public.schedule_merge_mark(r->>'fingerprint');
  IF EXISTS (SELECT 1 FROM public.cron_shard_state WHERE job_name = 'merge'
             AND last_run_stats->>'fingerprint' = split_part(r->>'fingerprint', '@', 1)) THEN
    RAISE EXCEPTION 'V5 失敗：check 後資料變了，mark 不應記下舊指紋';
  END IF;
  r := public.schedule_merge_check(since);
  PERFORM public.schedule_merge_mark(r->>'fingerprint');
  IF (public.schedule_merge_check(since)->>'changed')::boolean THEN
    RAISE EXCEPTION 'V5 失敗：資料沒變時 mark 後 check 應為 changed=false';
  END IF;
END $$;

-- ───────────── V6 last_live_at ─────────────
DO $$
DECLARE n integer; t timestamptz := now() - interval '7 minutes';
BEGIN
  n := public.schedule_touch_last_live(ARRAY['00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2']::uuid[], t);
  IF n <> 2 OR (SELECT last_live_at FROM public.vtubers WHERE id = '00000000-0000-4000-8000-0000000000b1') IS DISTINCT FROM t THEN
    RAISE EXCEPTION 'V6 失敗：應更新 2 筆且 last_live_at=p_now，實得 %', n;
  END IF;
END $$;

-- ───────────── V7 snapshot 來源欄式 ─────────────
DO $$
DECLARE r json;
BEGIN
  r := public.schedule_snapshot_source(now() - interval '12 hours');
  IF (r->'active'->'cols')::text <> '["id","vtuber_id","platform","external_id","source","status","scheduled_start","actual_start","actual_end","title","category","is_schedule_frame","fetched_at","merged_with"]' THEN
    RAISE EXCEPTION 'V7 失敗：active 欄位不符：%', r->'active'->'cols';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM json_array_elements(r->'active'->'rows') x WHERE x->>3 = 'zzV2Strm001') THEN
    RAISE EXCEPTION 'V7 失敗：active 應含 zzV2Strm001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM json_array_elements(r->'ended'->'rows') x WHERE x->>3 = 'zz-v2-paired') THEN
    RAISE EXCEPTION 'V7 失敗：ended 應含 zz-v2-paired';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM json_array_elements(r->'vtubers'->'rows') x WHERE x->>0 = '00000000-0000-4000-8000-0000000000b2') THEN
    RAISE EXCEPTION 'V7 失敗：vtubers 應含 ended 用到的 b2';
  END IF;
END $$;

-- ───────────── V8 權限：anon／authenticated 一律 permission denied ─────────────
CREATE TEMP TABLE zz_rpc_calls_v2 (call_sql text);
GRANT SELECT ON zz_rpc_calls_v2 TO anon, authenticated;
INSERT INTO zz_rpc_calls_v2 (call_sql) VALUES
  ($q$SELECT public.schedule_roster_v2('youtube')$q$),
  ($q$SELECT public.schedule_current_streams(ARRAY[]::uuid[])$q$),
  ($q$SELECT public.schedule_touch_last_live(ARRAY[]::uuid[], now())$q$),
  ($q$SELECT public.schedule_merge_fp(now())$q$),
  ($q$SELECT public.schedule_jcell(1)$q$),
  ($q$SELECT public.schedule_merge_check(now())$q$),
  ($q$SELECT public.schedule_merge_mark('x')$q$),
  ($q$SELECT public.schedule_snapshot_source(now())$q$);

SET LOCAL ROLE anon;
DO $$
DECLARE q record;
BEGIN
  FOR q IN SELECT call_sql FROM zz_rpc_calls_v2 LOOP
    BEGIN
      EXECUTE q.call_sql;
      RAISE EXCEPTION 'V8 失敗：anon 可以呼叫 %', q.call_sql;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
DECLARE q record;
BEGIN
  FOR q IN SELECT call_sql FROM zz_rpc_calls_v2 LOOP
    BEGIN
      EXECUTE q.call_sql;
      RAISE EXCEPTION 'V8 失敗：authenticated 可以呼叫 %', q.call_sql;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;
RESET ROLE;

\echo 'schedule_rpc_egress_v2：全部通過'
ROLLBACK;
