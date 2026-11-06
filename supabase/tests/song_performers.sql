-- 歌回合唱成員與剪輯來源：song_videos.clip_channel_*、song_segment_performers、
-- admin_save_song_video／community_save_song_video／admin_revert_song_edit／get_song_catalog 的行為測試（SQL1～SQL10）。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/song_performers.sql
-- 整檔在一個交易內，結尾 ROLLBACK，不留下任何資料。斷言失敗一律 RAISE EXCEPTION（ON_ERROR_STOP 讓 psql 以非 0 結束）。
-- 契約：計畫「測試規格表」SQL1～SQL10 與 scratchpad/contract-performers.md 的「DB」一節。
--
-- 對規格的假設（規格沒寫死，實作若不同請回頭對齊測試或規格）：
--   B1 CHECK 違規一律 SQLSTATE 23514（check_violation），不比對訊息。
--   B2 admin_save_song_video 回傳 json：id 是影片 uuid、segments[i].id 是片段 uuid、segments[i].performers 為 [{vtuber_id,name}]。
--   B3 站內合唱者那列的 name 欄允許同時有值（只是快取），目錄輸出一律取 vtubers.name 即時值。
--   B4 刪 vtuber 後「name 也是 null 的列整列被刪」由 trigger 處理；可能是延後執行，檢查前先 pg_temp.flush()。

BEGIN;

SET CONSTRAINTS ALL DEFERRED;

-- ───────────── 測試輔助（pg_temp，ROLLBACK 後消失） ─────────────
-- 一律用 plpgsql：函式本體延後解析，新欄位／新表尚未存在時整檔仍能載入，失敗點落在各自的斷言。

-- 預期 p_sql 丟錯，且 SQLSTATE 等於 p_state（沒丟錯、或丟的是別的錯都算失敗）
CREATE FUNCTION pg_temp.expect_state(p_tag text, p_sql text, p_state text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_err text; v_state text; v_failed boolean := false;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_err := SQLERRM;
    v_state := SQLSTATE;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION '% 失敗：預期 SQLSTATE %，但呼叫成功了', p_tag, p_state;
  END IF;
  IF v_state IS DISTINCT FROM p_state THEN
    RAISE EXCEPTION '% 失敗：預期 SQLSTATE %，實得 %（%）', p_tag, p_state, v_state, v_err;
  END IF;
END $$;

CREATE FUNCTION pg_temp.flush() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
END $$;

-- 後台存檔（回 jsonb）
CREATE FUNCTION pg_temp.asave(p_id uuid, p_video jsonb, p_segs jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.admin_save_song_video(p_id, p_video, p_segs)::jsonb;
END $$;

-- 後台 p_video：已發布的最小影片
CREATE FUNCTION pg_temp.av(p_vid text, p_title text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN jsonb_build_object('video_id', p_vid, 'title', p_title, 'status', 'published');
END $$;

-- 後台片段；p_id 為 null 代表新增（不帶 id）
CREATE FUNCTION pg_temp.aseg(p_id text, p_s integer, p_e integer, p_title text, p_pos integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o jsonb;
BEGIN
  o := jsonb_build_object('start_seconds', p_s, 'end_seconds', p_e, 'title', p_title,
                          'original_artist', 'zz原唱', 'position', p_pos);
  IF p_id IS NOT NULL THEN
    o := o || jsonb_build_object('id', p_id);
  END IF;
  RETURN o;
END $$;

-- 一位合唱者 {vtuber_id, name}
CREATE FUNCTION pg_temp.pf(p_vtuber uuid, p_name text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN jsonb_build_object('vtuber_id', p_vtuber, 'name', p_name);
END $$;

-- 某片段目前的合唱者列（依 position）
CREATE FUNCTION pg_temp.perf_rows(p_seg uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('p', position, 'v', vtuber_id, 'n', name) ORDER BY position), '[]'::jsonb)
    INTO r FROM public.song_segment_performers WHERE segment_id = p_seg;
  RETURN r;
END $$;

-- 某影片目前的剪輯來源
CREATE FUNCTION pg_temp.clip_of(p_vid text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object('n', clip_channel_name, 'u', clip_channel_url) INTO r FROM public.song_videos WHERE video_id = p_vid;
  RETURN r;
END $$;

CREATE FUNCTION pg_temp.ref_of(p_vid text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r uuid;
BEGIN
  SELECT id INTO r FROM public.song_videos WHERE video_id = p_vid;
  RETURN r;
END $$;

CREATE FUNCTION pg_temp.rev_of(p_vid text) RETURNS timestamptz LANGUAGE plpgsql AS $$
DECLARE r timestamptz;
BEGIN
  SELECT updated_at INTO r FROM public.song_videos WHERE video_id = p_vid;
  RETURN r;
END $$;

CREATE FUNCTION pg_temp.code_of(p_seg uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  SELECT code INTO r FROM public.song_segments WHERE id = p_seg;
  RETURN r;
END $$;

-- 社群存檔（回 jsonb）
CREATE FUNCTION pg_temp.csave(p_vid text, p_rev timestamptz, p_video jsonb, p_segs jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.community_save_song_video(p_vid, p_rev, p_video, p_segs,
           jsonb_build_object('source_note', 'zz測試備註', 'submitter_contact', 'zz@example.com', 'ip_hash', 'zzzzzzzzzzzzzzzz'))::jsonb;
END $$;

-- 社群 p_video：沿用原 VTuber、固定開台時間
CREATE FUNCTION pg_temp.cv(p_title text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN jsonb_build_object('title', p_title, 'vtuber_id', '00000000-0000-4000-8000-0000000000f1',
                            'streamed_at', '2026-01-01T12:00:00Z', 'duration_seconds', 7200);
END $$;

-- 社群片段（以 code 對應既有片段）
CREATE FUNCTION pg_temp.cseg(p_code text, p_s integer, p_e integer, p_title text, p_pos integer) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN jsonb_build_object('code', p_code, 'start_seconds', p_s, 'end_seconds', p_e, 'title', p_title,
                            'original_artist', 'zz原唱', 'version_note', NULL, 'position', p_pos);
END $$;

-- 目錄中某支影片的元素
CREATE FUNCTION pg_temp.cat_video(p_vid text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SELECT e INTO r FROM jsonb_array_elements(public.get_song_catalog()::jsonb) e WHERE e->>'v' = p_vid;
  RETURN r;
END $$;

-- ───────────── 測資（直接寫表，不依賴本地既有資料） ─────────────
-- f1＝影片所屬 VTuber；f2、f3＝合唱者（站內）；f4、f5＝專供 SQL10 刪除
INSERT INTO public.vtubers (id, name, nationality, slug) VALUES
  ('00000000-0000-4000-8000-0000000000f1', 'zz合唱測試主', 'TW', 'zz-performers-test-main'),
  ('00000000-0000-4000-8000-0000000000f2', 'zz合唱甲', 'TW', 'zz-performers-test-a'),
  ('00000000-0000-4000-8000-0000000000f3', 'zz合唱乙', 'TW', 'zz-performers-test-b'),
  ('00000000-0000-4000-8000-0000000000f4', 'zz合唱丙待刪', 'TW', 'zz-performers-test-c'),
  ('00000000-0000-4000-8000-0000000000f5', 'zz合唱丁待刪', 'TW', 'zz-performers-test-d');

-- ───────────── SQL1 新增影片可寫入剪輯來源；沒帶 key 保留、帶 null 清除 ─────────────
-- SQL1
DO $$
DECLARE
  r jsonb; vid uuid; c jsonb;
BEGIN
  -- 新影片帶 @handle 型網址
  r := pg_temp.asave(NULL,
         pg_temp.av('zzPfVid0001', 'zz剪輯影片') || jsonb_build_object('clip_channel_name', 'zz剪輯頻道', 'clip_channel_url', 'https://www.youtube.com/@zzclip'),
         jsonb_build_array(pg_temp.aseg(NULL, 0, 100, 'zz甲', 0)));
  vid := (r->>'id')::uuid;
  c := pg_temp.clip_of('zzPfVid0001');
  IF c IS DISTINCT FROM jsonb_build_object('n', 'zz剪輯頻道', 'u', 'https://www.youtube.com/@zzclip') THEN
    RAISE EXCEPTION 'SQL1 失敗：新影片的剪輯來源應寫入，得 %', c;
  END IF;

  -- 沒帶 clip key 的修改：保留原值
  PERFORM pg_temp.asave(vid, pg_temp.av('zzPfVid0001', 'zz剪輯影片改名'),
            jsonb_build_array(pg_temp.aseg((r->'segments'->0->>'id'), 0, 100, 'zz甲', 0)));
  IF pg_temp.clip_of('zzPfVid0001') IS DISTINCT FROM c THEN
    RAISE EXCEPTION 'SQL1 失敗：p_video 沒帶 clip key 應保留原值，得 %', pg_temp.clip_of('zzPfVid0001');
  END IF;
  IF (SELECT title FROM public.song_videos WHERE id = vid) IS DISTINCT FROM 'zz剪輯影片改名' THEN
    RAISE EXCEPTION 'SQL1 失敗：前置條件不成立（標題應已更新）';
  END IF;

  -- 兩個 key 都帶 null：清除
  PERFORM pg_temp.asave(vid,
            pg_temp.av('zzPfVid0001', 'zz剪輯影片改名') || jsonb_build_object('clip_channel_name', NULL, 'clip_channel_url', NULL),
            jsonb_build_array(pg_temp.aseg((r->'segments'->0->>'id'), 0, 100, 'zz甲', 0)));
  IF pg_temp.clip_of('zzPfVid0001') IS DISTINCT FROM jsonb_build_object('n', NULL, 'u', NULL) THEN
    RAISE EXCEPTION 'SQL1 失敗：兩 key 帶 null 應清除剪輯來源，得 %', pg_temp.clip_of('zzPfVid0001');
  END IF;

  -- channel/UC 型網址也合法
  PERFORM pg_temp.asave(NULL,
            pg_temp.av('zzPfVid0002', 'zz剪輯影片二') || jsonb_build_object('clip_channel_name', 'zz頻道ID型', 'clip_channel_url', 'https://m.youtube.com/channel/UCabcdefghijklmnopqrstuv'),
            jsonb_build_array(pg_temp.aseg(NULL, 0, 100, 'zz甲', 0)));
  IF pg_temp.clip_of('zzPfVid0002')->>'u' IS DISTINCT FROM 'https://m.youtube.com/channel/UCabcdefghijklmnopqrstuv' THEN
    RAISE EXCEPTION 'SQL1 失敗：channel/UC 型網址（m.youtube.com）應可寫入，得 %', pg_temp.clip_of('zzPfVid0002');
  END IF;
  RAISE NOTICE 'ok SQL1 新增影片可寫入剪輯來源；沒帶 key 保留、帶 null 清除';
END $$;

-- ───────────── SQL2 剪輯網址非 YouTube 被擋 ─────────────
-- SQL2
DO $$
DECLARE
  bad text; n integer := 0;
BEGIN
  FOREACH bad IN ARRAY ARRAY[
    'https://evil.com',
    'https://evil.com/@zzclip',
    'http://www.youtube.com/@zzclip',
    'https://youtu.be/@zzclip',
    'https://www.youtube.com.evil.com/@zzclip',
    'https://www.youtube.com/watch?v=abcdefghijk',
    'https://www.youtube.com/channel/UCshort',
    'https://www.youtube.com/@zzclip/videos'
  ] LOOP
    n := n + 1;
    PERFORM pg_temp.expect_state('SQL2', format(
      'select pg_temp.asave(NULL, %L::jsonb, %L::jsonb)',
      pg_temp.av('zzPfBad' || lpad(n::text, 4, '0'), 'zz壞網址') || jsonb_build_object('clip_channel_name', 'zz剪輯頻道', 'clip_channel_url', bad),
      jsonb_build_array(pg_temp.aseg(NULL, 0, 100, 'zz甲', 0))::text),
      '23514');
    IF EXISTS (SELECT 1 FROM public.song_videos WHERE video_id = 'zzPfBad' || lpad(n::text, 4, '0')) THEN
      RAISE EXCEPTION 'SQL2 失敗：網址 % 被擋下後不可建立影片', bad;
    END IF;
  END LOOP;

  -- 既有影片改成壞網址：丟錯且原值不變
  PERFORM pg_temp.expect_state('SQL2', format(
    'select pg_temp.asave(%L::uuid, %L::jsonb, %L::jsonb)',
    pg_temp.ref_of('zzPfVid0002'),
    pg_temp.av('zzPfVid0002', 'zz剪輯影片二') || jsonb_build_object('clip_channel_name', 'zz頻道ID型', 'clip_channel_url', 'https://evil.com'),
    (SELECT jsonb_agg(pg_temp.aseg(s.id::text, 0, 100, 'zz甲', 0))::text FROM public.song_segments s WHERE s.video_ref = pg_temp.ref_of('zzPfVid0002'))),
    '23514');
  IF pg_temp.clip_of('zzPfVid0002')->>'u' IS DISTINCT FROM 'https://m.youtube.com/channel/UCabcdefghijklmnopqrstuv' THEN
    RAISE EXCEPTION 'SQL2 失敗：被擋下後既有影片的剪輯網址不該變，得 %', pg_temp.clip_of('zzPfVid0002');
  END IF;
  RAISE NOTICE 'ok SQL2 剪輯網址非 YouTube 被擋（check_violation）';
END $$;

-- ───────────── SQL3 剪輯兩欄只給一欄被擋 ─────────────
-- SQL3
DO $$
BEGIN
  PERFORM pg_temp.expect_state('SQL3', format(
    'select pg_temp.asave(NULL, %L::jsonb, %L::jsonb)',
    pg_temp.av('zzPfOnly001', 'zz只有名稱') || jsonb_build_object('clip_channel_name', 'zz剪輯頻道'),
    jsonb_build_array(pg_temp.aseg(NULL, 0, 100, 'zz甲', 0))::text),
    '23514');
  PERFORM pg_temp.expect_state('SQL3', format(
    'select pg_temp.asave(NULL, %L::jsonb, %L::jsonb)',
    pg_temp.av('zzPfOnly002', 'zz只有網址') || jsonb_build_object('clip_channel_url', 'https://www.youtube.com/@zzclip'),
    jsonb_build_array(pg_temp.aseg(NULL, 0, 100, 'zz甲', 0))::text),
    '23514');
  -- 名稱有值、網址明確給 null 也算只給一欄
  PERFORM pg_temp.expect_state('SQL3', format(
    'select pg_temp.asave(NULL, %L::jsonb, %L::jsonb)',
    pg_temp.av('zzPfOnly003', 'zz網址null') || jsonb_build_object('clip_channel_name', 'zz剪輯頻道', 'clip_channel_url', NULL),
    jsonb_build_array(pg_temp.aseg(NULL, 0, 100, 'zz甲', 0))::text),
    '23514');
  IF EXISTS (SELECT 1 FROM public.song_videos WHERE video_id IN ('zzPfOnly001', 'zzPfOnly002', 'zzPfOnly003')) THEN
    RAISE EXCEPTION 'SQL3 失敗：被擋下後不可建立影片';
  END IF;
  RAISE NOTICE 'ok SQL3 剪輯兩欄只給一欄被擋（check_violation）';
END $$;

-- ───────────── SQL4 片段可寫入合唱者（1 站內＋1 站外，順序保留） ─────────────
-- SQL4
DO $$
DECLARE
  r jsonb; seg uuid; rows jsonb;
BEGIN
  r := pg_temp.asave(NULL, pg_temp.av('zzPfVid0004', 'zz合唱影片'),
         jsonb_build_array(
           pg_temp.aseg(NULL, 0, 100, 'zz合唱曲', 0)
             || jsonb_build_object('performers', jsonb_build_array(
                  pg_temp.pf('00000000-0000-4000-8000-0000000000f2', NULL),
                  pg_temp.pf(NULL, 'zz外部歌手'))),
           pg_temp.aseg(NULL, 100, 200, 'zz獨唱曲', 1)));
  seg := (r->'segments'->0->>'id')::uuid;
  rows := pg_temp.perf_rows(seg);
  IF jsonb_array_length(rows) <> 2 THEN
    RAISE EXCEPTION 'SQL4 失敗：應有 2 列合唱者，得 %', rows;
  END IF;
  IF rows->0->>'p' IS DISTINCT FROM '0' OR rows->0->>'v' IS DISTINCT FROM '00000000-0000-4000-8000-0000000000f2' THEN
    RAISE EXCEPTION 'SQL4 失敗：position 0 應為站內 f2，得 %', rows->0;
  END IF;
  IF rows->1->>'p' IS DISTINCT FROM '1' OR rows->1->'v' IS DISTINCT FROM 'null'::jsonb OR rows->1->>'n' IS DISTINCT FROM 'zz外部歌手' THEN
    RAISE EXCEPTION 'SQL4 失敗：position 1 應為站外「zz外部歌手」（vtuber_id 為 null），得 %', rows->1;
  END IF;
  -- 另一個沒帶 performers 的新片段：沒有合唱者
  IF jsonb_array_length(pg_temp.perf_rows((r->'segments'->1->>'id')::uuid)) <> 0 THEN
    RAISE EXCEPTION 'SQL4 失敗：新片段沒帶 performers 不該有合唱者';
  END IF;
  -- 回傳 json 的 performers
  IF jsonb_array_length(r->'segments'->0->'performers') <> 2
     OR r->'segments'->0->'performers'->0->>'vtuber_id' IS DISTINCT FROM '00000000-0000-4000-8000-0000000000f2'
     OR r->'segments'->0->'performers'->1->>'name' IS DISTINCT FROM 'zz外部歌手' THEN
    RAISE EXCEPTION 'SQL4 失敗：回傳的 segments[0].performers 應依順序帶出 2 位，得 %', r->'segments'->0->'performers';
  END IF;
  IF jsonb_array_length(r->'segments'->1->'performers') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'SQL4 失敗：沒有合唱者的片段回傳 performers 應為 []，得 %', r->'segments'->1->'performers';
  END IF;
  RAISE NOTICE 'ok SQL4 片段可寫入合唱者，順序與值正確';
END $$;

-- ───────────── SQL5 沒帶 performers 保留原合唱者 ─────────────
-- SQL5
DO $$
DECLARE
  vid uuid := pg_temp.ref_of('zzPfVid0004');
  seg uuid; code_before text; rows_before jsonb;
BEGIN
  SELECT id INTO seg FROM public.song_segments WHERE video_ref = vid AND position = 0;
  code_before := pg_temp.code_of(seg);
  rows_before := pg_temp.perf_rows(seg);
  IF jsonb_array_length(rows_before) <> 2 THEN RAISE EXCEPTION 'SQL5 失敗：前置條件不成立（應有 2 位合唱者）'; END IF;

  -- 只改歌名，片段不帶 performers
  PERFORM pg_temp.asave(vid, pg_temp.av('zzPfVid0004', 'zz合唱影片'),
            jsonb_build_array(
              pg_temp.aseg(seg::text, 0, 100, 'zz合唱曲改名', 0),
              pg_temp.aseg((SELECT id::text FROM public.song_segments WHERE video_ref = vid AND position = 1), 100, 200, 'zz獨唱曲', 1)));
  IF (SELECT title FROM public.song_segments WHERE id = seg) IS DISTINCT FROM 'zz合唱曲改名' THEN
    RAISE EXCEPTION 'SQL5 失敗：前置條件不成立（歌名應已更新）';
  END IF;
  IF pg_temp.perf_rows(seg) IS DISTINCT FROM rows_before THEN
    RAISE EXCEPTION 'SQL5 失敗：沒帶 performers 應保留原合唱者，預期 %，得 %', rows_before, pg_temp.perf_rows(seg);
  END IF;
  IF pg_temp.code_of(seg) IS DISTINCT FROM code_before THEN
    RAISE EXCEPTION 'SQL5 失敗：片段 code 不該變';
  END IF;
  RAISE NOTICE 'ok SQL5 沒帶 performers 保留原合唱者、code 不變';
END $$;

-- ───────────── SQL6 帶空陣列清除合唱者 ─────────────
-- SQL6
DO $$
DECLARE
  vid uuid := pg_temp.ref_of('zzPfVid0004');
  seg uuid; r jsonb;
BEGIN
  SELECT id INTO seg FROM public.song_segments WHERE video_ref = vid AND position = 0;
  r := pg_temp.asave(vid, pg_temp.av('zzPfVid0004', 'zz合唱影片'),
         jsonb_build_array(
           pg_temp.aseg(seg::text, 0, 100, 'zz合唱曲改名', 0) || jsonb_build_object('performers', '[]'::jsonb),
           pg_temp.aseg((SELECT id::text FROM public.song_segments WHERE video_ref = vid AND position = 1), 100, 200, 'zz獨唱曲', 1)));
  IF jsonb_array_length(pg_temp.perf_rows(seg)) <> 0 THEN
    RAISE EXCEPTION 'SQL6 失敗：performers=[] 應清空合唱者，得 %', pg_temp.perf_rows(seg);
  END IF;
  IF jsonb_array_length(r->'segments'->0->'performers') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'SQL6 失敗：回傳 performers 應為 []，得 %', r->'segments'->0->'performers';
  END IF;

  -- 整批替換：再寫入 [乙] 後，只剩乙
  PERFORM pg_temp.asave(vid, pg_temp.av('zzPfVid0004', 'zz合唱影片'),
            jsonb_build_array(
              pg_temp.aseg(seg::text, 0, 100, 'zz合唱曲改名', 0)
                || jsonb_build_object('performers', jsonb_build_array(pg_temp.pf('00000000-0000-4000-8000-0000000000f3', NULL))),
              pg_temp.aseg((SELECT id::text FROM public.song_segments WHERE video_ref = vid AND position = 1), 100, 200, 'zz獨唱曲', 1)));
  IF pg_temp.perf_rows(seg) IS DISTINCT FROM jsonb_build_array(jsonb_build_object('p', 0, 'v', '00000000-0000-4000-8000-0000000000f3', 'n', NULL)) THEN
    RAISE EXCEPTION 'SQL6 失敗：整批替換後應只剩乙一列，得 %', pg_temp.perf_rows(seg);
  END IF;
  RAISE NOTICE 'ok SQL6 帶空陣列清除合唱者、帶新陣列整批替換';
END $$;

-- ───────────── SQL7 社群修改後一鍵還原合唱與剪輯來源 ─────────────
-- SQL7
DO $$
DECLARE
  r0 jsonb; vid uuid; seg uuid; code text; rows0 jsonb; clip0 jsonb;
  rc jsonb; sub record;
BEGIN
  -- 初始：有剪輯來源、2 位合唱者
  r0 := pg_temp.asave(NULL,
          pg_temp.av('zzPfVid0007', 'zz社群還原') || jsonb_build_object(
            'vtuber_id', '00000000-0000-4000-8000-0000000000f1',
            'streamed_at', '2026-01-01T12:00:00Z', 'duration_seconds', 7200,
            'clip_channel_name', 'zz原剪輯頻道', 'clip_channel_url', 'https://www.youtube.com/@zzorig'),
          jsonb_build_array(
            pg_temp.aseg(NULL, 0, 100, 'zz甲', 0)
              || jsonb_build_object('performers', jsonb_build_array(
                   pg_temp.pf('00000000-0000-4000-8000-0000000000f2', NULL),
                   pg_temp.pf(NULL, 'zz原外部')))));
  vid := (r0->>'id')::uuid;
  seg := (r0->'segments'->0->>'id')::uuid;
  code := pg_temp.code_of(seg);
  rows0 := pg_temp.perf_rows(seg);
  clip0 := pg_temp.clip_of('zzPfVid0007');

  -- 社群修改：換剪輯來源、合唱者改成只剩乙
  rc := pg_temp.csave('zzPfVid0007', pg_temp.rev_of('zzPfVid0007'),
          pg_temp.cv('zz社群還原') || jsonb_build_object('clip_channel_name', 'zz新剪輯頻道', 'clip_channel_url', 'https://www.youtube.com/@zznew'),
          jsonb_build_array(
            pg_temp.cseg(code, 0, 100, 'zz甲', 0)
              || jsonb_build_object('performers', jsonb_build_array(pg_temp.pf('00000000-0000-4000-8000-0000000000f3', NULL)))));
  IF pg_temp.clip_of('zzPfVid0007') IS NOT DISTINCT FROM clip0 OR pg_temp.perf_rows(seg) IS NOT DISTINCT FROM rows0 THEN
    RAISE EXCEPTION 'SQL7 失敗：前置條件不成立（社群修改應已生效）';
  END IF;

  -- before 快照要含修改前的剪輯來源與每段合唱者
  SELECT * INTO sub FROM public.song_submissions WHERE id = (rc->>'submission_id')::uuid;
  IF sub.before->'video'->>'clip_channel_name' IS DISTINCT FROM 'zz原剪輯頻道'
     OR sub.before->'video'->>'clip_channel_url' IS DISTINCT FROM 'https://www.youtube.com/@zzorig' THEN
    RAISE EXCEPTION 'SQL7 失敗：before.video 應存修改前的 clip_channel_*，得 %', sub.before->'video';
  END IF;
  IF jsonb_typeof(sub.before->'segments'->0->'performers') IS DISTINCT FROM 'array'
     OR jsonb_array_length(sub.before->'segments'->0->'performers') <> 2 THEN
    RAISE EXCEPTION 'SQL7 失敗：before.segments[0].performers 應存修改前的 2 位合唱者，得 %', sub.before->'segments'->0;
  END IF;

  -- 還原
  PERFORM public.admin_revert_song_edit((rc->>'submission_id')::uuid);
  PERFORM pg_temp.flush();

  IF pg_temp.clip_of('zzPfVid0007') IS DISTINCT FROM clip0 THEN
    RAISE EXCEPTION 'SQL7 失敗：還原後剪輯來源應等於修改前 %，得 %', clip0, pg_temp.clip_of('zzPfVid0007');
  END IF;
  IF pg_temp.perf_rows(seg) IS DISTINCT FROM rows0 THEN
    RAISE EXCEPTION 'SQL7 失敗：還原後合唱者應等於修改前 %，得 %', rows0, pg_temp.perf_rows(seg);
  END IF;
  IF pg_temp.code_of(seg) IS DISTINCT FROM code THEN
    RAISE EXCEPTION 'SQL7 失敗：還原後片段 code 不該變';
  END IF;
  RAISE NOTICE 'ok SQL7 社群修改後一鍵還原合唱與剪輯來源';
END $$;

-- ───────────── SQL7b 原本沒有剪輯與合唱，社群加上後還原應回到「沒有」 ─────────────
-- SQL7b
DO $$
DECLARE
  r0 jsonb; seg uuid; code text; rc jsonb;
BEGIN
  r0 := pg_temp.asave(NULL,
          pg_temp.av('zzPfVid0008', 'zz社群還原空') || jsonb_build_object(
            'vtuber_id', '00000000-0000-4000-8000-0000000000f1',
            'streamed_at', '2026-01-01T12:00:00Z', 'duration_seconds', 7200),
          jsonb_build_array(pg_temp.aseg(NULL, 0, 100, 'zz甲', 0)));
  seg := (r0->'segments'->0->>'id')::uuid;
  code := pg_temp.code_of(seg);

  rc := pg_temp.csave('zzPfVid0008', pg_temp.rev_of('zzPfVid0008'),
          pg_temp.cv('zz社群還原空') || jsonb_build_object('clip_channel_name', 'zz新增剪輯', 'clip_channel_url', 'https://www.youtube.com/@zzadd'),
          jsonb_build_array(
            pg_temp.cseg(code, 0, 100, 'zz甲', 0)
              || jsonb_build_object('performers', jsonb_build_array(pg_temp.pf(NULL, 'zz新增外部')))));
  IF pg_temp.clip_of('zzPfVid0008')->>'n' IS DISTINCT FROM 'zz新增剪輯' OR jsonb_array_length(pg_temp.perf_rows(seg)) <> 1 THEN
    RAISE EXCEPTION 'SQL7b 失敗：前置條件不成立（社群新增應已生效）';
  END IF;

  PERFORM public.admin_revert_song_edit((rc->>'submission_id')::uuid);
  PERFORM pg_temp.flush();

  IF pg_temp.clip_of('zzPfVid0008') IS DISTINCT FROM jsonb_build_object('n', NULL, 'u', NULL) THEN
    RAISE EXCEPTION 'SQL7b 失敗：原本沒有剪輯來源，還原後兩欄應為 null，得 %', pg_temp.clip_of('zzPfVid0008');
  END IF;
  IF jsonb_array_length(pg_temp.perf_rows(seg)) <> 0 THEN
    RAISE EXCEPTION 'SQL7b 失敗：原本沒有合唱者，還原後應為 0 列，得 %', pg_temp.perf_rows(seg);
  END IF;
  RAISE NOTICE 'ok SQL7b 原本沒有剪輯與合唱，還原後回到沒有';
END $$;

-- ───────────── SQL8 目錄輸出合唱與剪輯來源 ─────────────
-- SQL8
DO $$
DECLARE
  e jsonb; seg jsonb;
BEGIN
  -- 站內合唱者那列 name 欄故意寫舊名：目錄必須取 vtubers.name 即時值
  PERFORM pg_temp.asave(NULL,
            pg_temp.av('zzPfCat0001', 'zz目錄影片') || jsonb_build_object(
              'clip_channel_name', 'zz目錄剪輯', 'clip_channel_url', 'https://www.youtube.com/@zzcat'),
            jsonb_build_array(
              pg_temp.aseg(NULL, 0, 100, 'zz目錄曲', 0)
                || jsonb_build_object('performers', jsonb_build_array(
                     pg_temp.pf('00000000-0000-4000-8000-0000000000f2', 'zz舊名快取'),
                     pg_temp.pf(NULL, 'zz目錄外部')))));
  e := pg_temp.cat_video('zzPfCat0001');
  IF e IS NULL THEN RAISE EXCEPTION 'SQL8 失敗：目錄找不到測試影片'; END IF;

  IF e->'cs' IS DISTINCT FROM jsonb_build_object('n', 'zz目錄剪輯', 'u', 'https://www.youtube.com/@zzcat') THEN
    RAISE EXCEPTION 'SQL8 失敗：影片 cs 應為 {n,u}，得 %', e->'cs';
  END IF;
  seg := e->'s'->0;
  IF jsonb_array_length(seg) <> 9 THEN
    RAISE EXCEPTION 'SQL8 失敗：片段陣列應有 9 欄（第 9 欄為合唱者），得 %', seg;
  END IF;
  IF seg->8 IS DISTINCT FROM jsonb_build_array(
       jsonb_build_array('00000000-0000-4000-8000-0000000000f2', 'zz合唱甲'),
       jsonb_build_array(NULL::text, 'zz目錄外部')) THEN
    RAISE EXCEPTION 'SQL8 失敗：第 9 欄應為 [[f2,"zz合唱甲"],[null,"zz目錄外部"]]（站內者取 vtubers.name），得 %', seg->8;
  END IF;

  -- VTuber 改名後目錄跟著變（即時值）
  UPDATE public.vtubers SET name = 'zz合唱甲改名' WHERE id = '00000000-0000-4000-8000-0000000000f2';
  IF pg_temp.cat_video('zzPfCat0001')->'s'->0->8->0->>1 IS DISTINCT FROM 'zz合唱甲改名' THEN
    RAISE EXCEPTION 'SQL8 失敗：VTuber 改名後，目錄合唱者名字應即時更新，得 %', pg_temp.cat_video('zzPfCat0001')->'s'->0->8;
  END IF;
  UPDATE public.vtubers SET name = 'zz合唱甲' WHERE id = '00000000-0000-4000-8000-0000000000f2';
  RAISE NOTICE 'ok SQL8 目錄輸出合唱與剪輯來源，站內者名字取即時值';
END $$;

-- ───────────── SQL9 沒有合唱與剪輯的影片格式不變（無 cs、第 9 欄為空陣列） ─────────────
-- SQL9
DO $$
DECLARE
  e jsonb;
BEGIN
  PERFORM pg_temp.asave(NULL, pg_temp.av('zzPfCat0002', 'zz目錄影片無'),
            jsonb_build_array(pg_temp.aseg(NULL, 0, 100, 'zz一般曲', 0)));
  e := pg_temp.cat_video('zzPfCat0002');
  IF e IS NULL THEN RAISE EXCEPTION 'SQL9 失敗：目錄找不到測試影片'; END IF;
  IF e ? 'cs' THEN
    RAISE EXCEPTION 'SQL9 失敗：沒有剪輯來源的影片不該輸出 cs key，得 %', e;
  END IF;
  IF jsonb_array_length(e->'s'->0) <> 9 THEN
    RAISE EXCEPTION 'SQL9 失敗：片段陣列仍應有 9 欄，得 %', e->'s'->0;
  END IF;
  IF e->'s'->0->8 IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'SQL9 失敗：沒有合唱者的片段第 9 欄應為 []，得 %', e->'s'->0->8;
  END IF;
  -- 舊欄位位置不變
  IF e->'s'->0->>3 IS DISTINCT FROM 'zz一般曲' OR (e->'s'->0->>1)::integer <> 0 OR (e->'s'->0->>2)::integer <> 100 THEN
    RAISE EXCEPTION 'SQL9 失敗：前 8 欄的位置與內容不該變，得 %', e->'s'->0;
  END IF;
  RAISE NOTICE 'ok SQL9 沒有合唱與剪輯的影片：無 cs、第 9 欄為空陣列';
END $$;

-- ───────────── SQL10 刪除 VTuber：有 name 的列保留並改 vtuber_id 為 null，沒 name 的列被清 ─────────────
-- SQL10
DO $$
DECLARE
  r jsonb; seg uuid; rows jsonb;
BEGIN
  r := pg_temp.asave(NULL, pg_temp.av('zzPfVid0010', 'zz刪人影片'),
         jsonb_build_array(
           pg_temp.aseg(NULL, 0, 100, 'zz刪人曲', 0)
             || jsonb_build_object('performers', jsonb_build_array(
                  pg_temp.pf('00000000-0000-4000-8000-0000000000f4', NULL),
                  pg_temp.pf('00000000-0000-4000-8000-0000000000f5', 'zz保留名')))));
  seg := (r->'segments'->0->>'id')::uuid;
  IF jsonb_array_length(pg_temp.perf_rows(seg)) <> 2 THEN RAISE EXCEPTION 'SQL10 失敗：前置條件不成立（應有 2 位合唱者）'; END IF;

  DELETE FROM public.vtubers WHERE id IN ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f5');
  PERFORM pg_temp.flush();

  rows := pg_temp.perf_rows(seg);
  IF jsonb_array_length(rows) <> 1 THEN
    RAISE EXCEPTION 'SQL10 失敗：無 name 的列應被清除、有 name 的列保留，預期剩 1 列，得 %', rows;
  END IF;
  IF rows->0->'v' IS DISTINCT FROM 'null'::jsonb OR rows->0->>'n' IS DISTINCT FROM 'zz保留名' THEN
    RAISE EXCEPTION 'SQL10 失敗：保留的列 vtuber_id 應變 null、name 仍為「zz保留名」，得 %', rows->0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.song_segments WHERE id = seg) THEN
    RAISE EXCEPTION 'SQL10 失敗：刪 VTuber 不可連帶刪除片段';
  END IF;
  RAISE NOTICE 'ok SQL10 刪除 VTuber 不連帶刪合唱列（有 name 的保留、無 name 的清除）';
END $$;

\echo 'song_performers：全部通過'
ROLLBACK;
