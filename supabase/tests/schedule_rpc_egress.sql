-- 排程 Edge Function 出口流量瘦身：資料庫端 RPC 的行為與權限測試。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/schedule_rpc_egress.sql
-- 整檔在一個交易內，結尾 ROLLBACK，不留下任何資料。斷言失敗一律 RAISE EXCEPTION（ON_ERROR_STOP 讓 psql 以非 0 結束）。

BEGIN;

-- ───────────── 測資（最小必要欄位） ─────────────
-- 實況主 a1（YouTube＋Twitch）、a2（Twitch）
INSERT INTO public.vtubers (id, name, nationality, slug) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'egress 測試甲', 'TW', 'zz-egress-a1'),
  ('00000000-0000-4000-8000-0000000000a2', 'egress 測試乙', 'TW', 'zz-egress-a2');

INSERT INTO public.vtuber_channels (id, vtuber_id, platform, external_id, handle) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'UCzzEgressTest0000000001', '@zzegress1'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'UCzzEgressTest0000000002', '@zzegress2'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a1', 'twitch',  'zz_egress_tw_1', 'zz_egress_tw_1'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000a2', 'twitch',  'zz_egress_tw_2', 'zz_egress_tw_2'),
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000a2', 'twitch',  'zz_egress_tw_3', 'zz_egress_tw_3');

-- T3 用：已看過的影片
INSERT INTO public.schedule_seen_videos (video_id, channel_id, kind) VALUES
  ('zzSeenVid01', '00000000-0000-4000-8000-0000000000c1', 'video');

INSERT INTO public.streams (id, vtuber_id, channel_id, platform, external_id, source, status, scheduled_start, title) VALUES
  -- T3／T7～T9：YouTube 已有場次（一小時後開始的待機室，會進 snapshot）
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
   'youtube', 'zzStrmVid01', 'yt_waiting_room', 'scheduled', now() + interval '1 hour', '原標題'),
  -- T3：Twitch 的 external_id 剛好長得像影片 ID（不能拿來排除 YouTube 影片）
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c3',
   'twitch', 'zzOnlyTwi01', 'twitch_live', 'ended', NULL, NULL),
  -- T6：頻道 c3 的 Twitch 週表
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c3',
   'twitch', 'zz-seg-keep', 'twitch_schedule', 'scheduled', now() + interval '1 hour', 'keep'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c3',
   'twitch', 'zz-seg-gone', 'twitch_schedule', 'scheduled', now() + interval '2 hours', 'gone'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c3',
   'twitch', 'zz-seg-past', 'twitch_schedule', 'scheduled', now() - interval '1 hour', 'past'),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c3',
   'twitch', 'zz-seg-beyond', 'twitch_schedule', 'scheduled', now() + interval '5 days', 'beyond covered_until'),
  -- T6：頻道 c4（covered_until 為 null：整段都算）
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c4',
   'twitch', 'zz-seg-far', 'twitch_schedule', 'scheduled', now() + interval '6 days', 'far'),
  -- T6：頻道 c5 不在 p_items（被限速／失敗的頻道）→ 不能動
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c5',
   'twitch', 'zz-seg-other', 'twitch_schedule', 'scheduled', now() + interval '1 hour', 'other channel');

-- T5 用：c1 已有狀態列（tier 3），c2 沒有
INSERT INTO public.schedule_channel_state (channel_id, tier, tier_reason, rss_fail_streak, rss_last_ok_at) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 3, 'inactive_90d', 1, '2026-01-01T00:00:00Z');

\echo '測資建立完成'

-- ───────────── T3 只回新影片 id ─────────────
-- T3
DO $$
DECLARE r text[];
BEGIN
  r := public.schedule_unseen_video_ids(ARRAY['zzSeenVid01', 'zzStrmVid01', 'zzOnlyTwi01', 'zzBrandNew1']);
  IF (SELECT array_agg(x ORDER BY x) FROM unnest(r) x) IS DISTINCT FROM ARRAY['zzBrandNew1', 'zzOnlyTwi01'] THEN
    RAISE EXCEPTION 'T3 失敗：預期只回 {zzBrandNew1,zzOnlyTwi01}，實得 %', r;
  END IF;
  r := public.schedule_unseen_video_ids(ARRAY[]::text[]);
  IF coalesce(cardinality(r), 0) <> 0 THEN
    RAISE EXCEPTION 'T3 失敗：空陣列應回空，實得 %', r;
  END IF;
END $$;

-- ───────────── T5 狀態寫入保留 tier ─────────────
-- T5
DO $$
DECLARE s record;
BEGIN
  PERFORM public.schedule_upsert_channel_states(jsonb_build_array(
    jsonb_build_object('channel_id', '00000000-0000-4000-8000-0000000000c1', 'rss_fail_streak', 0,
                       'rss_last_error', NULL, 'last_checked_at', '2026-10-09T00:00:00Z'),
    jsonb_build_object('channel_id', '00000000-0000-4000-8000-0000000000c2', 'rss_fail_streak', 2,
                       'rss_last_error', 'timeout', 'last_checked_at', '2026-10-09T00:00:00Z')
  ));
  SELECT * INTO s FROM public.schedule_channel_state WHERE channel_id = '00000000-0000-4000-8000-0000000000c1';
  IF s.tier IS DISTINCT FROM 3::smallint THEN
    RAISE EXCEPTION 'T5 失敗：既有頻道 tier 應保留 3，實得 %', s.tier;
  END IF;
  IF s.rss_fail_streak <> 0 OR s.last_checked_at IS DISTINCT FROM '2026-10-09T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'T5 失敗：payload 內的欄位沒有更新（rss_fail_streak=%, last_checked_at=%）', s.rss_fail_streak, s.last_checked_at;
  END IF;
  IF s.rss_last_ok_at IS DISTINCT FROM '2026-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'T5 失敗：payload 沒有的 rss_last_ok_at 被覆寫成 %', s.rss_last_ok_at;
  END IF;
  SELECT * INTO s FROM public.schedule_channel_state WHERE channel_id = '00000000-0000-4000-8000-0000000000c2';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'T5 失敗：新頻道 c2 沒有建立狀態列';
  END IF;
  IF s.tier IS DISTINCT FROM 2::smallint OR s.rss_fail_streak <> 2 THEN
    RAISE EXCEPTION 'T5 失敗：新頻道 tier 應為 2、rss_fail_streak 應為 2，實得 tier=% streak=%', s.tier, s.rss_fail_streak;
  END IF;
END $$;

-- ───────────── T6 Twitch 週表批次 reconcile ─────────────
-- T6
DO $$
DECLARE n integer; t timestamptz := now(); st text; fa timestamptz;
BEGIN
  n := public.schedule_twitch_reconcile(t, jsonb_build_array(
    jsonb_build_object('channel_id', '00000000-0000-4000-8000-0000000000c3', 'keep', jsonb_build_array('zz-seg-keep'),
                       'covered_until', to_jsonb(t + interval '3 days')),
    jsonb_build_object('channel_id', '00000000-0000-4000-8000-0000000000c4', 'keep', '[]'::jsonb, 'covered_until', NULL)
  ));
  IF n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'T6 失敗：預期取消 2 筆（zz-seg-gone、zz-seg-far），實得 %', n;
  END IF;
  SELECT status, fetched_at INTO st, fa FROM public.streams WHERE id = '00000000-0000-4000-8000-0000000000f2';
  IF st <> 'canceled' OR fa IS DISTINCT FROM t THEN
    RAISE EXCEPTION 'T6 失敗：zz-seg-gone 應為 canceled 且 fetched_at=p_now，實得 % / %', st, fa;
  END IF;
  SELECT status INTO st FROM public.streams WHERE id = '00000000-0000-4000-8000-0000000000f5';
  IF st <> 'canceled' THEN
    RAISE EXCEPTION 'T6 失敗：covered_until 為 null 時 zz-seg-far 應取消，實得 %', st;
  END IF;
  IF EXISTS (SELECT 1 FROM public.streams
             WHERE id IN ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f3',
                          '00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f6')
               AND status <> 'scheduled') THEN
    RAISE EXCEPTION 'T6 失敗：keep／已過開始時間／超出 covered_until／不在 p_items 的列不能動';
  END IF;
END $$;

-- ───────────── T7／T8／T9 snapshot 指紋 ─────────────
-- T7（SQL 端）：mark 之後同樣的資料再 check → changed=false
DO $$
DECLARE r json;
BEGIN
  r := public.schedule_snapshot_check(now(), now() - interval '12 hours', 60);
  IF r->>'fingerprint' IS NULL OR r->>'changed' IS NULL THEN
    RAISE EXCEPTION 'T7 失敗：check 應回 {changed, fingerprint}，實得 %', r;
  END IF;
  PERFORM public.schedule_snapshot_mark(r->>'fingerprint');
  r := public.schedule_snapshot_check(now(), now() - interval '12 hours', 60);
  IF (r->>'changed')::boolean THEN
    RAISE EXCEPTION 'T7 失敗：mark 後資料沒變，check 仍回 changed=true（%）', r;
  END IF;
END $$;

-- T9：只改 viewer_count、updated_at（不輸出到 snapshot 的欄位）→ changed=false
DO $$
DECLARE r json;
BEGIN
  UPDATE public.streams SET viewer_count = 4321, updated_at = now() + interval '5 minutes'
   WHERE id = '00000000-0000-4000-8000-0000000000e1';
  r := public.schedule_snapshot_check(now(), now() - interval '12 hours', 60);
  IF (r->>'changed')::boolean THEN
    RAISE EXCEPTION 'T9 失敗：只改 viewer_count／updated_at 卻判定 changed=true（%）', r;
  END IF;
END $$;

-- T8（SQL 端）：改某場 title → changed=true；mark 超過 p_force_minutes → 強制 changed=true
DO $$
DECLARE r json;
BEGIN
  UPDATE public.streams SET title = '新標題' WHERE id = '00000000-0000-4000-8000-0000000000e1';
  r := public.schedule_snapshot_check(now(), now() - interval '12 hours', 60);
  IF NOT (r->>'changed')::boolean THEN
    RAISE EXCEPTION 'T8 失敗：改了 title 卻判定 changed=false（%）', r;
  END IF;
  PERFORM public.schedule_snapshot_mark(r->>'fingerprint');
  r := public.schedule_snapshot_check(now(), now() - interval '12 hours', 60);
  IF (r->>'changed')::boolean THEN
    RAISE EXCEPTION 'T8 失敗：mark 新指紋後同資料應為 changed=false（%）', r;
  END IF;
  r := public.schedule_snapshot_check(now() + interval '61 minutes', now() + interval '61 minutes' - interval '12 hours', 60);
  IF NOT (r->>'changed')::boolean THEN
    RAISE EXCEPTION 'T8 失敗：距上次 mark 超過 60 分鐘應強制 changed=true（%）', r;
  END IF;
END $$;

-- ───────────── T11 權限：anon／authenticated 一律 permission denied ─────────────
-- T11
CREATE TEMP TABLE zz_rpc_calls (call_sql text);
GRANT SELECT ON zz_rpc_calls TO anon, authenticated;
INSERT INTO zz_rpc_calls (call_sql) VALUES
  ($q$SELECT public.schedule_roster(NULL)$q$),
  ($q$SELECT public.schedule_unseen_video_ids(ARRAY['zzBrandNew1'])$q$),
  ($q$SELECT public.schedule_upsert_channel_states('[]'::jsonb)$q$),
  ($q$SELECT public.schedule_twitch_reconcile(now(), '[]'::jsonb)$q$),
  ($q$SELECT public.schedule_snapshot_check(now(), now() - interval '12 hours', 60)$q$),
  ($q$SELECT public.schedule_snapshot_source(now() - interval '12 hours')$q$),
  ($q$SELECT public.schedule_snapshot_mark('x')$q$);

SET LOCAL ROLE anon;
DO $$
DECLARE q record;
BEGIN
  FOR q IN SELECT call_sql FROM zz_rpc_calls LOOP
    BEGIN
      EXECUTE q.call_sql;
      RAISE EXCEPTION 'T11 失敗：anon 可以呼叫 %', q.call_sql;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- 預期：permission denied
    END;
  END LOOP;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
DECLARE q record;
BEGIN
  FOR q IN SELECT call_sql FROM zz_rpc_calls LOOP
    BEGIN
      EXECUTE q.call_sql;
      RAISE EXCEPTION 'T11 失敗：authenticated 可以呼叫 %', q.call_sql;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- 預期：permission denied
    END;
  END LOOP;
END $$;
RESET ROLE;

\echo 'schedule_rpc_egress：全部通過'
ROLLBACK;
