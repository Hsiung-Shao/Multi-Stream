-- 歌回社群直接編輯：community_save_song_video／admin_revert_song_edit／get_song_catalog 單曲標記 的行為與權限測試（SQL1～SQL10）。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/song_community_edit.sql
-- 整檔在一個交易內，結尾 ROLLBACK，不留下任何資料。斷言失敗一律 RAISE EXCEPTION（ON_ERROR_STOP 讓 psql 以非 0 結束）。
-- 契約：scratchpad/songs-contract-community-edit.md 的「DB」一節。
--
-- 對規格的假設（規格沒寫死，實作若不同請回頭對齊測試或規格）：
--   B1 錯誤一律 SQLERRM 完全等於錯誤碼、SQLSTATE = P0001（submission_not_found 為 P0002）。
--   B2 回傳 json 的 video_ref 是 song_videos.id（uuid 文字）；rev 是寫入後 song_videos.updated_at。
--   B3 同一個交易內 now() 不變，所以投稿紀錄的 created_at 在測試中手動錯開，讓「不早於這筆」的判斷有先後可言。
--   B4 song_segments 的孤兒清除 trigger 是延後執行；還原刪片段後用 pg_temp.flush() 強制觸發一次確認不報錯。

BEGIN;

SET CONSTRAINTS ALL DEFERRED;

-- ───────────── 測試輔助（pg_temp，ROLLBACK 後消失） ─────────────
-- 一律用 plpgsql：函式本體延後解析，新函式／新欄位尚未存在時整檔仍能載入，失敗點落在各自的斷言。

-- 預期 p_sql 丟錯，且 SQLERRM 完全等於 p_code、SQLSTATE 等於 p_state（沒丟錯、或丟的是別的錯都算失敗）
CREATE FUNCTION pg_temp.expect_err(p_tag text, p_sql text, p_code text, p_state text DEFAULT 'P0001') RETURNS void LANGUAGE plpgsql AS $$
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
    RAISE EXCEPTION '% 失敗：預期錯誤「%」，但呼叫成功了', p_tag, p_code;
  END IF;
  IF v_err IS DISTINCT FROM p_code OR v_state IS DISTINCT FROM p_state THEN
    RAISE EXCEPTION '% 失敗：預期錯誤「%」(%)，實得「%」(%)', p_tag, p_code, p_state, v_err, v_state;
  END IF;
END $$;

CREATE FUNCTION pg_temp.flush() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
END $$;

-- 投稿附帶資料
CREATE FUNCTION pg_temp.meta() RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN jsonb_build_object('source_note', 'zz測試備註', 'submitter_contact', 'zz@example.com', 'ip_hash', 'zzzzzzzzzzzzzzzz');
END $$;

-- p_video 物件
CREATE FUNCTION pg_temp.vj(p_title text, p_vtuber uuid, p_dur integer) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN jsonb_build_object('title', p_title, 'vtuber_id', p_vtuber,
                            'streamed_at', '2026-01-01T12:00:00Z', 'duration_seconds', p_dur);
END $$;

-- 一個片段物件；p_code 為 null 代表新增（不帶 code）
CREATE FUNCTION pg_temp.sj(p_code text, p_s integer, p_e integer, p_title text, p_pos integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o jsonb;
BEGIN
  o := jsonb_build_object('start_seconds', p_s, 'end_seconds', p_e, 'title', p_title,
                          'original_artist', 'zz原唱', 'version_note', NULL, 'position', p_pos);
  IF p_code IS NOT NULL THEN
    o := o || jsonb_build_object('code', p_code);
  END IF;
  RETURN o;
END $$;

-- 呼叫被測 RPC（回 jsonb）
CREATE FUNCTION pg_temp.save(p_vid text, p_rev timestamptz, p_video jsonb, p_segs jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.community_save_song_video(p_vid, p_rev, p_video, p_segs, pg_temp.meta())::jsonb;
END $$;

CREATE FUNCTION pg_temp.revert(p_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.admin_revert_song_edit(p_id)::jsonb;
END $$;

-- 預期 save 丟 p_code
CREATE FUNCTION pg_temp.expect_save(p_tag text, p_vid text, p_rev timestamptz, p_video jsonb, p_segs jsonb, p_code text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.expect_err(
    p_tag,
    format('select pg_temp.save(%L, %L::timestamptz, %L::jsonb, %L::jsonb)', p_vid, p_rev, p_video::text, p_segs::text),
    p_code);
END $$;

-- 建測試影片（直接寫表，不經被測函式）
CREATE FUNCTION pg_temp.mkvideo(p_vid text, p_title text, p_dur integer, p_status text DEFAULT 'published') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r uuid;
BEGIN
  INSERT INTO public.song_videos (video_id, title, vtuber_id, streamed_at, duration_seconds, status)
  VALUES (p_vid, p_title, '00000000-0000-4000-8000-0000000000e1', '2026-01-01T12:00:00Z', p_dur, p_status)
  RETURNING id INTO r;
  RETURN r;
END $$;

-- 建測試片段，回 code
CREATE FUNCTION pg_temp.mkseg(p_vid text, p_s integer, p_e integer, p_title text, p_pos integer) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  INSERT INTO public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
  SELECT v.id, p_s, p_e, p_title, 'zz原唱', p_pos FROM public.song_videos v WHERE v.video_id = p_vid
  RETURNING code INTO r;
  RETURN r;
END $$;

CREATE FUNCTION pg_temp.rev_of(p_vid text) RETURNS timestamptz LANGUAGE plpgsql AS $$
DECLARE r timestamptz;
BEGIN
  SELECT updated_at INTO r FROM public.song_videos WHERE video_id = p_vid;
  RETURN r;
END $$;

CREATE FUNCTION pg_temp.ref_of(p_vid text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r uuid;
BEGIN
  SELECT id INTO r FROM public.song_videos WHERE video_id = p_vid;
  RETURN r;
END $$;

-- 片段內容快照（含 code，依開始秒、code 排序）；用來比對「還原後等於還原前」
CREATE FUNCTION pg_temp.seg_snap(p_vid text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('code', s.code, 's', s.start_seconds, 'e', s.end_seconds,
                                               'title', s.title, 'artist', s.original_artist, 'pos', s.position)
                            ORDER BY s.start_seconds, s.code), '[]'::jsonb)
    INTO r
    FROM public.song_segments s JOIN public.song_videos v ON v.id = s.video_ref
   WHERE v.video_id = p_vid;
  RETURN r;
END $$;

-- 整支影片完整狀態（影片列＋全部片段列，含 updated_at）；用來證明「資料不變」
CREATE FUNCTION pg_temp.full_state(p_vid text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
           'video', to_jsonb(v),
           'segments', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.code) FROM public.song_segments s WHERE s.video_ref = v.id), '[]'::jsonb),
           'subs', (SELECT count(*) FROM public.song_submissions q WHERE q.video_id = p_vid))
    INTO r
    FROM public.song_videos v WHERE v.video_id = p_vid;
  RETURN r;
END $$;

-- 目錄中某支影片的 k
CREATE FUNCTION pg_temp.cat_k(p_vid text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  SELECT e->>'k' INTO r FROM jsonb_array_elements(public.get_song_catalog()::jsonb) e WHERE e->>'v' = p_vid;
  RETURN r;
END $$;

-- ───────────── 測資（直接寫表，不依賴本地既有資料） ─────────────
INSERT INTO public.vtubers (id, name, nationality, slug) VALUES
  ('00000000-0000-4000-8000-0000000000e1', 'zz社群編輯測試主', 'TW', 'zz-community-edit-test'),
  ('00000000-0000-4000-8000-0000000000e2', 'zz社群編輯測試乙', 'TW', 'zz-community-edit-test-2');

-- 已發布、2 小時、兩首：SQL1
SELECT pg_temp.mkvideo('zzCeVid0001', 'zz歌回一', 7200);
SELECT pg_temp.mkseg('zzCeVid0001', 0, 100, 'zz甲', 0);
SELECT pg_temp.mkseg('zzCeVid0001', 100, 200, 'zz乙', 1);
-- SQL2 少了既有片段
SELECT pg_temp.mkvideo('zzCeVid0002', 'zz歌回二', 7200);
SELECT pg_temp.mkseg('zzCeVid0002', 0, 100, 'zz甲', 0);
SELECT pg_temp.mkseg('zzCeVid0002', 100, 200, 'zz乙', 1);
-- SQL3 版本不一致
SELECT pg_temp.mkvideo('zzCeVid0003', 'zz歌回三', 7200);
SELECT pg_temp.mkseg('zzCeVid0003', 0, 100, 'zz甲', 0);
-- SQL4 鎖定
SELECT pg_temp.mkvideo('zzCeVid0004', 'zz歌回四鎖定', 7200);
SELECT pg_temp.mkseg('zzCeVid0004', 0, 100, 'zz甲', 0);
-- SQL4 草稿
SELECT pg_temp.mkvideo('zzCeVid0005', 'zz歌回五草稿', 7200, 'draft');
SELECT pg_temp.mkseg('zzCeVid0005', 0, 100, 'zz甲', 0);
-- SQL6 不屬於這支影片的 code
SELECT pg_temp.mkvideo('zzCeVid0006', 'zz歌回六', 7200);
SELECT pg_temp.mkseg('zzCeVid0006', 0, 100, 'zz甲', 0);
-- SQL7 連改兩次後還原
SELECT pg_temp.mkvideo('zzCeVid0007', 'zz歌回七', 7200);
SELECT pg_temp.mkseg('zzCeVid0007', 0, 100, 'zz甲', 0);
SELECT pg_temp.mkseg('zzCeVid0007', 100, 200, 'zz乙', 1);
-- SQL4c 修正時 vtuber_id 送 null
SELECT pg_temp.mkvideo('zzCeVid0008', 'zz歌回八', 7200);
SELECT pg_temp.mkseg('zzCeVid0008', 0, 100, 'zz甲', 0);
-- SQL4d 開台時間毫秒相同就保留原值（微秒不被截掉）
SELECT pg_temp.mkvideo('zzCeVid0009', 'zz歌回九', 7200);
SELECT pg_temp.mkseg('zzCeVid0009', 0, 100, 'zz甲', 0);
-- SQL10 單曲判定
SELECT pg_temp.mkvideo('zzCeSingle1', 'zz單曲 5 分鐘', 300);
SELECT pg_temp.mkseg('zzCeSingle1', 0, 300, 'zz單曲', 0);
SELECT pg_temp.mkvideo('zzCeStream1', 'zz歌回 2 小時三首', 7200);
SELECT pg_temp.mkseg('zzCeStream1', 0, 100, 'zz一', 0);
SELECT pg_temp.mkseg('zzCeStream1', 100, 200, 'zz二', 1);
SELECT pg_temp.mkseg('zzCeStream1', 200, 300, 'zz三', 2);
SELECT pg_temp.mkvideo('zzCeNullD01', 'zz沒有長度', NULL);
SELECT pg_temp.mkseg('zzCeNullD01', 0, 100, 'zz一', 0);
SELECT pg_temp.mkvideo('zzCeBound60', 'zz剛好 600 秒', 600);
SELECT pg_temp.mkseg('zzCeBound60', 0, 100, 'zz一', 0);
SELECT pg_temp.mkvideo('zzCeShort21', 'zz短但兩首', 300);
SELECT pg_temp.mkseg('zzCeShort21', 0, 100, 'zz一', 0);
SELECT pg_temp.mkseg('zzCeShort21', 100, 200, 'zz二', 1);

-- ───────────── SQL1 修正既有歌回原地更新、code 不變 ─────────────
-- SQL1
DO $$
DECLARE
  vid text := 'zzCeVid0001';
  ref uuid := pg_temp.ref_of('zzCeVid0001');
  c1 text; c2 text; r jsonb; sub record; v record;
BEGIN
  SELECT code INTO c1 FROM public.song_segments WHERE video_ref = ref AND position = 0;
  SELECT code INTO c2 FROM public.song_segments WHERE video_ref = ref AND position = 1;

  r := pg_temp.save(vid, pg_temp.rev_of(vid),
         pg_temp.vj('zz歌回一改名', '00000000-0000-4000-8000-0000000000e1', 9999),
         jsonb_build_array(pg_temp.sj(c1, 0, 90, 'zz甲改', 0),
                           pg_temp.sj(c2, 100, 200, 'zz乙', 1),
                           pg_temp.sj(NULL, 200, 300, 'zz丙新', 2)));

  IF r->>'kind' IS DISTINCT FROM 'revision' THEN RAISE EXCEPTION 'SQL1 失敗：回傳 kind 應為 revision，得 %', r; END IF;
  IF r->>'video_ref' IS DISTINCT FROM ref::text THEN RAISE EXCEPTION 'SQL1 失敗：回傳 video_ref 應為影片 id，得 %', r; END IF;
  IF (r->>'rev')::timestamptz IS DISTINCT FROM pg_temp.rev_of(vid) THEN
    RAISE EXCEPTION 'SQL1 失敗：回傳 rev 應等於寫入後的 updated_at，得 %（實際 %）', r->>'rev', pg_temp.rev_of(vid);
  END IF;
  IF r->>'submission_id' IS NULL THEN RAISE EXCEPTION 'SQL1 失敗：回傳缺 submission_id'; END IF;

  -- 舊 code 全在、多一首
  IF (SELECT count(*) FROM public.song_segments WHERE video_ref = ref) <> 3 THEN
    RAISE EXCEPTION 'SQL1 失敗：片段數應為 3（原 2 首＋新增 1 首），得 %', (SELECT count(*) FROM public.song_segments WHERE video_ref = ref);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.song_segments WHERE video_ref = ref AND code = c1)
     OR NOT EXISTS (SELECT 1 FROM public.song_segments WHERE video_ref = ref AND code = c2) THEN
    RAISE EXCEPTION 'SQL1 失敗：既有片段的 code 必須保留';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.song_segments WHERE video_ref = ref AND code = c1 AND title = 'zz甲改' AND end_seconds = 90) THEN
    RAISE EXCEPTION 'SQL1 失敗：c1 的歌名與結束時間應被原地更新';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.song_segments WHERE video_ref = ref AND title = 'zz丙新' AND start_seconds = 200 AND code NOT IN (c1, c2)) THEN
    RAISE EXCEPTION 'SQL1 失敗：沒帶 code 的片段應被新增並配發新 code';
  END IF;

  SELECT title, status, duration_seconds INTO v FROM public.song_videos WHERE video_id = vid;
  IF v.title IS DISTINCT FROM 'zz歌回一改名' THEN RAISE EXCEPTION 'SQL1 失敗：影片標題應更新，得 %', v.title; END IF;
  IF v.status IS DISTINCT FROM 'published' THEN RAISE EXCEPTION 'SQL1 失敗：status 不該變，得 %', v.status; END IF;
  IF v.duration_seconds IS DISTINCT FROM 7200 THEN
    RAISE EXCEPTION 'SQL1 失敗：原本有長度時不可被送來的值覆蓋（預期 7200），得 %', v.duration_seconds;
  END IF;

  -- 投稿紀錄
  SELECT * INTO sub FROM public.song_submissions WHERE id = (r->>'submission_id')::uuid;
  IF sub.id IS NULL THEN RAISE EXCEPTION 'SQL1 失敗：找不到投稿紀錄'; END IF;
  IF sub.kind <> 'revision' OR sub.status <> 'applied' THEN
    RAISE EXCEPTION 'SQL1 失敗：投稿紀錄應為 revision／applied，得 %／%', sub.kind, sub.status;
  END IF;
  IF sub.target_video_ref IS DISTINCT FROM ref OR sub.result_video_ref IS DISTINCT FROM ref THEN
    RAISE EXCEPTION 'SQL1 失敗：target_video_ref 與 result_video_ref 應皆為該影片';
  END IF;
  IF sub.before IS NULL THEN RAISE EXCEPTION 'SQL1 失敗：before 不可為 null'; END IF;
  IF jsonb_array_length(sub.before->'segments') <> 2 THEN
    RAISE EXCEPTION 'SQL1 失敗：before 應是修改前的 2 個片段，得 %', sub.before->'segments';
  END IF;
  IF NOT (sub.before->'segments' @> jsonb_build_array(jsonb_build_object('code', c1, 'start_seconds', 0, 'end_seconds', 100, 'title', 'zz甲'))) THEN
    RAISE EXCEPTION 'SQL1 失敗：before 應含原片段 c1（0-100 zz甲），得 %', sub.before->'segments';
  END IF;
  IF sub.before->'video'->>'title' IS DISTINCT FROM 'zz歌回一' THEN
    RAISE EXCEPTION 'SQL1 失敗：before.video.title 應為修改前的標題，得 %', sub.before->'video';
  END IF;
  RAISE NOTICE 'ok SQL1 修正既有歌回原地更新、code 不變';
END $$;

-- ───────────── SQL2 少了既有片段就擋下 ─────────────
-- SQL2
DO $$
DECLARE
  vid text := 'zzCeVid0002';
  ref uuid := pg_temp.ref_of('zzCeVid0002');
  c1 text; s0 jsonb; n0 integer;
BEGIN
  SELECT code INTO c1 FROM public.song_segments WHERE video_ref = ref AND position = 0;
  s0 := pg_temp.full_state(vid);
  n0 := (SELECT count(*) FROM public.song_segments WHERE video_ref = ref);

  PERFORM pg_temp.expect_save('SQL2', vid, pg_temp.rev_of(vid),
            pg_temp.vj('zz歌回二', '00000000-0000-4000-8000-0000000000e1', 7200),
            jsonb_build_array(pg_temp.sj(c1, 0, 100, 'zz甲', 0)),
            'cannot_delete');

  IF (SELECT count(*) FROM public.song_segments WHERE video_ref = ref) <> n0 THEN
    RAISE EXCEPTION 'SQL2 失敗：被擋下後片段數不該變';
  END IF;
  IF pg_temp.full_state(vid) IS DISTINCT FROM s0 THEN
    RAISE EXCEPTION 'SQL2 失敗：被擋下後影片、片段（含 updated_at）與投稿紀錄數都不該變';
  END IF;
  RAISE NOTICE 'ok SQL2 少了既有片段就擋下（cannot_delete）';
END $$;

-- ───────────── SQL3 版本不一致就擋下 ─────────────
-- SQL3
DO $$
DECLARE
  vid text := 'zzCeVid0003';
  ref uuid := pg_temp.ref_of('zzCeVid0003');
  c1 text; s0 jsonb;
BEGIN
  SELECT code INTO c1 FROM public.song_segments WHERE video_ref = ref AND position = 0;
  s0 := pg_temp.full_state(vid);

  PERFORM pg_temp.expect_save('SQL3', vid, pg_temp.rev_of(vid) - interval '1 second',
            pg_temp.vj('zz歌回三被改', '00000000-0000-4000-8000-0000000000e1', 7200),
            jsonb_build_array(pg_temp.sj(c1, 0, 80, 'zz甲被改', 0)),
            'stale_edit');

  IF pg_temp.full_state(vid) IS DISTINCT FROM s0 THEN
    RAISE EXCEPTION 'SQL3 失敗：stale_edit 被擋下後資料不該變';
  END IF;
  IF (SELECT title FROM public.song_videos WHERE video_id = vid) IS DISTINCT FROM 'zz歌回三' THEN
    RAISE EXCEPTION 'SQL3 失敗：影片標題不該被改';
  END IF;
  RAISE NOTICE 'ok SQL3 版本不一致就擋下（stale_edit）';
END $$;

-- ───────────── SQL4 鎖定或草稿的歌回不能改 ─────────────
-- SQL4
DO $$
DECLARE
  v_locked text := 'zzCeVid0004';
  v_draft text := 'zzCeVid0005';
  c_locked text; c_draft text; s_locked jsonb; s_draft jsonb;
BEGIN
  UPDATE public.song_videos SET community_locked = true WHERE video_id = v_locked;
  SELECT s.code INTO c_locked FROM public.song_segments s WHERE s.video_ref = pg_temp.ref_of(v_locked) AND s.position = 0;
  SELECT s.code INTO c_draft FROM public.song_segments s WHERE s.video_ref = pg_temp.ref_of(v_draft) AND s.position = 0;
  s_locked := pg_temp.full_state(v_locked);
  s_draft := pg_temp.full_state(v_draft);

  -- 版本（rev）是正確的，仍因鎖定被擋；證明擋的是 video_locked 而不是 stale_edit
  PERFORM pg_temp.expect_save('SQL4', v_locked, pg_temp.rev_of(v_locked),
            pg_temp.vj('zz鎖定被改', '00000000-0000-4000-8000-0000000000e1', 7200),
            jsonb_build_array(pg_temp.sj(c_locked, 0, 80, 'zz甲被改', 0)),
            'video_locked');
  PERFORM pg_temp.expect_save('SQL4', v_draft, pg_temp.rev_of(v_draft),
            pg_temp.vj('zz草稿被改', '00000000-0000-4000-8000-0000000000e1', 7200),
            jsonb_build_array(pg_temp.sj(c_draft, 0, 80, 'zz甲被改', 0)),
            'video_locked');

  IF pg_temp.full_state(v_locked) IS DISTINCT FROM s_locked THEN RAISE EXCEPTION 'SQL4 失敗：鎖定的歌回資料不該變'; END IF;
  IF pg_temp.full_state(v_draft) IS DISTINCT FROM s_draft THEN RAISE EXCEPTION 'SQL4 失敗：草稿歌回資料不該變'; END IF;
  RAISE NOTICE 'ok SQL4 鎖定或草稿的歌回不能改（video_locked）';
END $$;

-- ───────────── SQL4b 草稿或鎖定的歌回，p_rev 為 null 也回 video_locked（先判鎖定，再判 video_exists） ─────────────
-- SQL4b
DO $$
DECLARE
  v_locked text := 'zzCeVid0004';
  v_draft text := 'zzCeVid0005';
  c_draft text; c_locked text; s_draft jsonb; s_locked jsonb;
BEGIN
  SELECT s.code INTO c_draft FROM public.song_segments s WHERE s.video_ref = pg_temp.ref_of(v_draft) AND s.position = 0;
  SELECT s.code INTO c_locked FROM public.song_segments s WHERE s.video_ref = pg_temp.ref_of(v_locked) AND s.position = 0;
  s_draft := pg_temp.full_state(v_draft);
  s_locked := pg_temp.full_state(v_locked);

  PERFORM pg_temp.expect_save('SQL4b', v_draft, NULL,
            pg_temp.vj('zz草稿被改', '00000000-0000-4000-8000-0000000000e1', 7200),
            jsonb_build_array(pg_temp.sj(c_draft, 0, 80, 'zz甲被改', 0)),
            'video_locked');
  PERFORM pg_temp.expect_save('SQL4b', v_locked, NULL,
            pg_temp.vj('zz鎖定被改', '00000000-0000-4000-8000-0000000000e1', 7200),
            jsonb_build_array(pg_temp.sj(c_locked, 0, 80, 'zz甲被改', 0)),
            'video_locked');

  IF pg_temp.full_state(v_draft) IS DISTINCT FROM s_draft THEN RAISE EXCEPTION 'SQL4b 失敗：草稿歌回資料不該變'; END IF;
  IF pg_temp.full_state(v_locked) IS DISTINCT FROM s_locked THEN RAISE EXCEPTION 'SQL4b 失敗：鎖定歌回資料不該變'; END IF;
  RAISE NOTICE 'ok SQL4b 草稿或鎖定的歌回 p_rev 為 null 也回 video_locked';
END $$;

-- ───────────── SQL4c 修正時 vtuber_id 送 null 不清空、送別人則換人 ─────────────
-- SQL4c
DO $$
DECLARE
  vid text := 'zzCeVid0008';
  ref uuid := pg_temp.ref_of('zzCeVid0008');
  other constant uuid := '00000000-0000-4000-8000-0000000000e2';
  orig constant uuid := '00000000-0000-4000-8000-0000000000e1';
  c1 text; r jsonb;
BEGIN
  SELECT code INTO c1 FROM public.song_segments WHERE video_ref = ref AND position = 0;

  -- 送 null：沿用原本的 VTuber
  r := pg_temp.save(vid, pg_temp.rev_of(vid),
         pg_temp.vj('zz歌回八', NULL, 7200),
         jsonb_build_array(pg_temp.sj(c1, 0, 100, 'zz甲', 0)));
  IF (SELECT vtuber_id FROM public.song_videos WHERE id = ref) IS DISTINCT FROM orig THEN
    RAISE EXCEPTION 'SQL4c 失敗：修正送 vtuber_id null 不可清空，預期 %，得 %', orig, (SELECT vtuber_id FROM public.song_videos WHERE id = ref);
  END IF;
  -- 投稿紀錄存實際生效的 VTuber（不是送來的 null），後台摘要才不會誤判成改了 VTuber
  IF (SELECT vtuber_id FROM public.song_submissions WHERE id = (r->>'submission_id')::uuid) IS DISTINCT FROM orig THEN
    RAISE EXCEPTION 'SQL4c 失敗：投稿紀錄的 vtuber_id 應為實際生效的 %，得 %', orig,
      (SELECT vtuber_id FROM public.song_submissions WHERE id = (r->>'submission_id')::uuid);
  END IF;

  -- 送別的 VTuber：換成新的
  r := pg_temp.save(vid, (r->>'rev')::timestamptz,
         pg_temp.vj('zz歌回八', other, 7200),
         jsonb_build_array(pg_temp.sj(c1, 0, 100, 'zz甲', 0)));
  IF (SELECT vtuber_id FROM public.song_videos WHERE id = ref) IS DISTINCT FROM other THEN
    RAISE EXCEPTION 'SQL4c 失敗：修正送別的 VTuber 應換人，預期 %，得 %', other, (SELECT vtuber_id FROM public.song_videos WHERE id = ref);
  END IF;
  IF (SELECT vtuber_id FROM public.song_submissions WHERE id = (r->>'submission_id')::uuid) IS DISTINCT FROM other THEN
    RAISE EXCEPTION 'SQL4c 失敗：換人時投稿紀錄的 vtuber_id 應為新的 %', other;
  END IF;
  RAISE NOTICE 'ok SQL4c 修正時 vtuber_id null 不清空、送別人則換人';
END $$;

-- ───────────── SQL4d 開台時間：毫秒相同保留原值（含微秒），不同才換 ─────────────
-- SQL4d
DO $$
DECLARE
  vid text := 'zzCeVid0009';
  ref uuid := pg_temp.ref_of('zzCeVid0009');
  orig constant timestamptz := '2026-10-23T09:39:07.679176+00';
  c1 text; r jsonb;
BEGIN
  UPDATE public.song_videos SET streamed_at = orig WHERE id = ref;
  SELECT code INTO c1 FROM public.song_segments WHERE video_ref = ref AND position = 0;

  -- 送來的值只有毫秒精度（前端 ISO 經後端正規化）→ 視為沒改
  r := pg_temp.save(vid, pg_temp.rev_of(vid),
         pg_temp.vj('zz歌回九', '00000000-0000-4000-8000-0000000000e1', 7200) || jsonb_build_object('streamed_at', '2026-10-23T09:39:07.679Z'),
         jsonb_build_array(pg_temp.sj(c1, 0, 100, 'zz甲', 0)));
  IF (SELECT streamed_at FROM public.song_videos WHERE id = ref) IS DISTINCT FROM orig THEN
    RAISE EXCEPTION 'SQL4d 失敗：毫秒相同應保留原值 %，得 %', orig, (SELECT streamed_at FROM public.song_videos WHERE id = ref);
  END IF;

  -- 真的改了就換成新的
  r := pg_temp.save(vid, (r->>'rev')::timestamptz,
         pg_temp.vj('zz歌回九', '00000000-0000-4000-8000-0000000000e1', 7200) || jsonb_build_object('streamed_at', '2026-10-24T10:15:00Z'),
         jsonb_build_array(pg_temp.sj(c1, 0, 100, 'zz甲', 0)));
  IF (SELECT streamed_at FROM public.song_videos WHERE id = ref) IS DISTINCT FROM '2026-10-24T10:15:00Z'::timestamptz THEN
    RAISE EXCEPTION 'SQL4d 失敗：開台時間改了應採用新值，得 %', (SELECT streamed_at FROM public.song_videos WHERE id = ref);
  END IF;
  RAISE NOTICE 'ok SQL4d 開台時間毫秒相同保留原值、不同才換';
END $$;

-- ───────────── SQL5 新歌回：沒 VTuber 擋下、有則直接發布 ─────────────
-- SQL5
DO $$
DECLARE
  vid text := 'zzCeNew0001';
  r jsonb; sub record; v record; ref uuid;
BEGIN
  PERFORM pg_temp.expect_save('SQL5', vid, NULL,
            pg_temp.vj('zz新歌回', NULL, 3600),
            jsonb_build_array(pg_temp.sj(NULL, 0, 100, 'zz新一', 0)),
            'vtuber_required');
  IF EXISTS (SELECT 1 FROM public.song_videos WHERE video_id = vid) THEN
    RAISE EXCEPTION 'SQL5 失敗：vtuber_required 被擋下後不可建立影片';
  END IF;
  IF EXISTS (SELECT 1 FROM public.song_submissions WHERE video_id = vid) THEN
    RAISE EXCEPTION 'SQL5 失敗：vtuber_required 被擋下後不可留投稿紀錄';
  END IF;

  r := pg_temp.save(vid, NULL,
         pg_temp.vj('zz新歌回', '00000000-0000-4000-8000-0000000000e1', 3600),
         jsonb_build_array(pg_temp.sj(NULL, 0, 100, 'zz新一', 0), pg_temp.sj(NULL, 100, 200, 'zz新二', 1)));
  IF r->>'kind' IS DISTINCT FROM 'new' THEN RAISE EXCEPTION 'SQL5 失敗：回傳 kind 應為 new，得 %', r; END IF;

  SELECT * INTO v FROM public.song_videos WHERE video_id = vid;
  IF v.id IS NULL THEN RAISE EXCEPTION 'SQL5 失敗：新歌回沒有建立'; END IF;
  ref := v.id;
  IF v.status IS DISTINCT FROM 'published' THEN RAISE EXCEPTION 'SQL5 失敗：新歌回應直接發布，得 %', v.status; END IF;
  IF v.vtuber_id IS DISTINCT FROM '00000000-0000-4000-8000-0000000000e1'::uuid THEN RAISE EXCEPTION 'SQL5 失敗：vtuber_id 沒寫入'; END IF;
  IF r->>'video_ref' IS DISTINCT FROM ref::text THEN RAISE EXCEPTION 'SQL5 失敗：回傳 video_ref 應為新影片 id，得 %', r; END IF;
  IF (r->>'rev')::timestamptz IS DISTINCT FROM v.updated_at THEN RAISE EXCEPTION 'SQL5 失敗：回傳 rev 應等於新影片 updated_at'; END IF;
  IF (SELECT count(*) FROM public.song_segments WHERE video_ref = ref) <> 2 THEN
    RAISE EXCEPTION 'SQL5 失敗：新歌回應有 2 個片段，得 %', (SELECT count(*) FROM public.song_segments WHERE video_ref = ref);
  END IF;

  SELECT * INTO sub FROM public.song_submissions WHERE id = (r->>'submission_id')::uuid;
  IF sub.id IS NULL THEN RAISE EXCEPTION 'SQL5 失敗：找不到投稿紀錄'; END IF;
  IF sub.kind <> 'new' OR sub.status <> 'applied' THEN
    RAISE EXCEPTION 'SQL5 失敗：投稿紀錄應為 new／applied，得 %／%', sub.kind, sub.status;
  END IF;
  IF sub.before IS NOT NULL THEN RAISE EXCEPTION 'SQL5 失敗：新歌回的 before 應為 null，得 %', sub.before; END IF;
  RAISE NOTICE 'ok SQL5 新歌回沒 VTuber 擋下、有則直接發布';
END $$;

-- ───────────── SQL5b 影片已存在但 p_rev 為 null ─────────────
-- SQL5b
DO $$
DECLARE
  vid text := 'zzCeVid0002';
  c1 text; c2 text; s0 jsonb;
BEGIN
  SELECT code INTO c1 FROM public.song_segments WHERE video_ref = pg_temp.ref_of(vid) AND position = 0;
  SELECT code INTO c2 FROM public.song_segments WHERE video_ref = pg_temp.ref_of(vid) AND position = 1;
  s0 := pg_temp.full_state(vid);

  PERFORM pg_temp.expect_save('SQL5b', vid, NULL,
            pg_temp.vj('zz歌回二', '00000000-0000-4000-8000-0000000000e1', 7200),
            jsonb_build_array(pg_temp.sj(c1, 0, 100, 'zz甲', 0), pg_temp.sj(c2, 100, 200, 'zz乙', 1)),
            'video_exists');
  IF pg_temp.full_state(vid) IS DISTINCT FROM s0 THEN RAISE EXCEPTION 'SQL5b 失敗：被擋下後資料不該變'; END IF;
  RAISE NOTICE 'ok SQL5b 影片已存在但 p_rev 為 null（video_exists）';
END $$;

-- ───────────── SQL6 不屬於這支影片的 code 擋下 ─────────────
-- SQL6
DO $$
DECLARE
  vid text := 'zzCeVid0006';
  c_own text; c_foreign text; s0 jsonb;
BEGIN
  SELECT code INTO c_own FROM public.song_segments WHERE video_ref = pg_temp.ref_of(vid) AND position = 0;
  SELECT code INTO c_foreign FROM public.song_segments WHERE video_ref = pg_temp.ref_of('zzCeVid0003') AND position = 0;
  s0 := pg_temp.full_state(vid);

  -- 別支影片的 code
  PERFORM pg_temp.expect_save('SQL6', vid, pg_temp.rev_of(vid),
            pg_temp.vj('zz歌回六', '00000000-0000-4000-8000-0000000000e1', 7200),
            jsonb_build_array(pg_temp.sj(c_own, 0, 100, 'zz甲', 0), pg_temp.sj(c_foreign, 100, 200, 'zz偷來的', 1)),
            'unknown_segment');
  -- 根本不存在的 code（符合 8 碼格式）
  PERFORM pg_temp.expect_save('SQL6', vid, pg_temp.rev_of(vid),
            pg_temp.vj('zz歌回六', '00000000-0000-4000-8000-0000000000e1', 7200),
            jsonb_build_array(pg_temp.sj(c_own, 0, 100, 'zz甲', 0), pg_temp.sj('zzzzzzzz', 100, 200, 'zz憑空的', 1)),
            'unknown_segment');

  IF pg_temp.full_state(vid) IS DISTINCT FROM s0 THEN RAISE EXCEPTION 'SQL6 失敗：被擋下後資料不該變'; END IF;
  IF (SELECT count(*) FROM public.song_segments WHERE code = c_foreign) <> 1
     OR (SELECT video_ref FROM public.song_segments WHERE code = c_foreign) IS DISTINCT FROM pg_temp.ref_of('zzCeVid0003') THEN
    RAISE EXCEPTION 'SQL6 失敗：別支影片的片段不可被搬動';
  END IF;
  RAISE NOTICE 'ok SQL6 不屬於這支影片的 code 擋下（unknown_segment）';
END $$;

-- ───────────── SQL7 還原修正回到快照、之後的修改一併還原 ─────────────
-- SQL7
DO $$
DECLARE
  vid text := 'zzCeVid0007';
  ref uuid := pg_temp.ref_of('zzCeVid0007');
  c1 text; c2 text; c_new text; s0 jsonb; ra jsonb; rb jsonb; rr jsonb; sub_a uuid; sub_b uuid; t record;
BEGIN
  SELECT code INTO c1 FROM public.song_segments WHERE video_ref = ref AND position = 0;
  SELECT code INTO c2 FROM public.song_segments WHERE video_ref = ref AND position = 1;
  s0 := pg_temp.seg_snap(vid);

  -- 第一次修改：改 c1，換影片標題
  ra := pg_temp.save(vid, pg_temp.rev_of(vid),
          pg_temp.vj('zz歌回七改A', '00000000-0000-4000-8000-0000000000e1', 7200),
          jsonb_build_array(pg_temp.sj(c1, 0, 90, 'zz甲A', 0), pg_temp.sj(c2, 100, 200, 'zz乙', 1)));
  sub_a := (ra->>'submission_id')::uuid;

  -- 第二次修改：改 c2，再新增一首（用第一次回傳的 rev）
  rb := pg_temp.save(vid, (ra->>'rev')::timestamptz,
          pg_temp.vj('zz歌回七改B', '00000000-0000-4000-8000-0000000000e1', 7200),
          jsonb_build_array(pg_temp.sj(c1, 0, 90, 'zz甲A', 0), pg_temp.sj(c2, 100, 180, 'zz乙B', 1),
                            pg_temp.sj(NULL, 200, 300, 'zz丙B新增', 2)));
  sub_b := (rb->>'submission_id')::uuid;
  SELECT code INTO c_new FROM public.song_segments WHERE video_ref = ref AND title = 'zz丙B新增';
  IF c_new IS NULL THEN RAISE EXCEPTION 'SQL7 失敗：前置條件不成立（第二次新增的片段不存在）'; END IF;

  -- 同一交易內 now() 不變，手動錯開時間：A 比 B 早
  UPDATE public.song_submissions SET created_at = now() - interval '2 minutes' WHERE id = sub_a;
  UPDATE public.song_submissions SET created_at = now() - interval '1 minute' WHERE id = sub_b;

  -- 還原第一次
  rr := pg_temp.revert(sub_a);
  PERFORM pg_temp.flush();

  IF pg_temp.seg_snap(vid) IS DISTINCT FROM s0 THEN
    RAISE EXCEPTION 'SQL7 失敗：還原後片段內容應等於第一次修改前，預期 %，得 %', s0, pg_temp.seg_snap(vid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.song_segments WHERE code = c1 AND video_ref = ref)
     OR NOT EXISTS (SELECT 1 FROM public.song_segments WHERE code = c2 AND video_ref = ref) THEN
    RAISE EXCEPTION 'SQL7 失敗：原 code 都應還在';
  END IF;
  IF EXISTS (SELECT 1 FROM public.song_segments WHERE code = c_new) THEN
    RAISE EXCEPTION 'SQL7 失敗：第二次新增的片段應被一併刪除';
  END IF;
  IF (SELECT title FROM public.song_videos WHERE video_id = vid) IS DISTINCT FROM 'zz歌回七' THEN
    RAISE EXCEPTION 'SQL7 失敗：影片標題應還原為「zz歌回七」，得 %', (SELECT title FROM public.song_videos WHERE video_id = vid);
  END IF;
  IF (SELECT status FROM public.song_videos WHERE video_id = vid) IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'SQL7 失敗：還原修正不應改 status';
  END IF;

  FOR t IN SELECT id, status, reverted_at FROM public.song_submissions WHERE id IN (sub_a, sub_b) LOOP
    IF t.status <> 'reverted' THEN RAISE EXCEPTION 'SQL7 失敗：投稿 % 應為 reverted，得 %', t.id, t.status; END IF;
    IF t.reverted_at IS NULL THEN RAISE EXCEPTION 'SQL7 失敗：投稿 % 的 reverted_at 不應為 null', t.id; END IF;
  END LOOP;
  IF (rr->>'reverted')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'SQL7 失敗：回傳 reverted 應為 2，得 %', rr;
  END IF;
  IF rr->>'kind' IS DISTINCT FROM 'revision' OR rr->>'video_ref' IS DISTINCT FROM ref::text THEN
    RAISE EXCEPTION 'SQL7 失敗：回傳應帶 kind=revision 與 video_ref，得 %', rr;
  END IF;
  RAISE NOTICE 'ok SQL7 還原修正回到快照、code 保留、之後的修改一併還原';
END $$;

-- ───────────── SQL7b 還原非 applied 的紀錄 ─────────────
-- SQL7b
DO $$
DECLARE
  sub_reverted uuid; sub_pending uuid := '00000000-0000-4000-8000-00000000d001';
BEGIN
  -- 已 reverted 的（SQL7 留下的）
  SELECT id INTO sub_reverted FROM public.song_submissions WHERE video_id = 'zzCeVid0007' AND status = 'reverted' ORDER BY created_at LIMIT 1;
  IF sub_reverted IS NULL THEN RAISE EXCEPTION 'SQL7b 失敗：前置條件不成立（找不到 reverted 紀錄）'; END IF;
  PERFORM pg_temp.expect_err('SQL7b', format('select pg_temp.revert(%L::uuid)', sub_reverted), 'not_applied');

  -- 還在 pending 的
  INSERT INTO public.song_submissions (id, kind, video_id, title, segments, ip_hash, status)
  VALUES (sub_pending, 'new', 'zzCeVid0099', 'zz待審', '[{"start_seconds":0,"end_seconds":60,"title":"x","position":0}]'::jsonb,
          'zzzzzzzzzzzzzzzz', 'pending');
  PERFORM pg_temp.expect_err('SQL7b', format('select pg_temp.revert(%L::uuid)', sub_pending), 'not_applied');

  -- 找不到
  PERFORM pg_temp.expect_err('SQL7b', $q$select pg_temp.revert('00000000-0000-4000-8000-00000000ffff'::uuid)$q$, 'submission_not_found', 'P0002');

  IF (SELECT status FROM public.song_submissions WHERE id = sub_pending) <> 'pending' THEN
    RAISE EXCEPTION 'SQL7b 失敗：被擋下後 pending 紀錄不該變';
  END IF;
  RAISE NOTICE 'ok SQL7b 還原非 applied 的紀錄（not_applied）';
END $$;

-- ───────────── SQL8 還原新歌回改成草稿而不刪除 ─────────────
-- SQL8
DO $$
DECLARE
  vid text := 'zzCeNew0002';
  r jsonb; rr jsonb; ref uuid; codes_before text[]; codes_after text[];
BEGIN
  r := pg_temp.save(vid, NULL,
         pg_temp.vj('zz新歌回二', '00000000-0000-4000-8000-0000000000e1', 3600),
         jsonb_build_array(pg_temp.sj(NULL, 0, 100, 'zz新一', 0), pg_temp.sj(NULL, 100, 200, 'zz新二', 1)));
  ref := pg_temp.ref_of(vid);
  IF (SELECT status FROM public.song_videos WHERE id = ref) <> 'published' THEN
    RAISE EXCEPTION 'SQL8 失敗：前置條件不成立（新歌回應已發布）';
  END IF;
  SELECT array_agg(code ORDER BY code) INTO codes_before FROM public.song_segments WHERE video_ref = ref;

  rr := pg_temp.revert((r->>'submission_id')::uuid);
  PERFORM pg_temp.flush();

  IF NOT EXISTS (SELECT 1 FROM public.song_videos WHERE id = ref) THEN
    RAISE EXCEPTION 'SQL8 失敗：還原新歌回不可刪除影片';
  END IF;
  IF (SELECT status FROM public.song_videos WHERE id = ref) IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'SQL8 失敗：影片應改為 draft，得 %', (SELECT status FROM public.song_videos WHERE id = ref);
  END IF;
  SELECT array_agg(code ORDER BY code) INTO codes_after FROM public.song_segments WHERE video_ref = ref;
  IF codes_after IS DISTINCT FROM codes_before OR coalesce(array_length(codes_after, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'SQL8 失敗：片段與 code 都應保留（預期 %，得 %）', codes_before, codes_after;
  END IF;
  IF (SELECT status FROM public.song_submissions WHERE id = (r->>'submission_id')::uuid) <> 'reverted'
     OR (SELECT reverted_at FROM public.song_submissions WHERE id = (r->>'submission_id')::uuid) IS NULL THEN
    RAISE EXCEPTION 'SQL8 失敗：投稿紀錄應為 reverted 且 reverted_at 非 null';
  END IF;
  IF rr->>'kind' IS DISTINCT FROM 'new' OR (rr->>'reverted')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'SQL8 失敗：回傳應為 kind=new、reverted=1，得 %', rr;
  END IF;
  RAISE NOTICE 'ok SQL8 還原新歌回改成草稿而不刪除';
END $$;

-- ───────────── SQL9 權限：anon／authenticated 不能執行，service_role 可以 ─────────────
-- SQL9
DO $$
DECLARE
  f_save constant text := 'public.community_save_song_video(text, timestamptz, jsonb, jsonb, jsonb)';
  f_rev constant text := 'public.admin_revert_song_edit(uuid)';
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[f_save, f_rev] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'SQL9 失敗：anon 不應能執行 %', f;
    END IF;
    IF has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'SQL9 失敗：authenticated 不應能執行 %', f;
    END IF;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'SQL9 失敗：service_role 應能執行 %', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok SQL9 anon 與 authenticated 不能執行兩支新函式，service_role 可以';
END $$;

-- ───────────── SQL10 目錄標出單曲 ─────────────
-- SQL10
DO $$
DECLARE k text;
BEGIN
  k := pg_temp.cat_k('zzCeSingle1');
  IF k IS DISTINCT FROM 'single' THEN RAISE EXCEPTION 'SQL10 失敗：5 分鐘一首的影片 k 應為 single，得 %', k; END IF;

  k := pg_temp.cat_k('zzCeStream1');
  IF k IS DISTINCT FROM 'stream' THEN RAISE EXCEPTION 'SQL10 失敗：2 小時三首的影片 k 應為 stream，得 %', k; END IF;

  k := pg_temp.cat_k('zzCeNullD01');
  IF k IS DISTINCT FROM 'stream' THEN RAISE EXCEPTION 'SQL10 失敗：沒有長度的一首影片 k 應為 stream，得 %', k; END IF;

  -- 邊界：剛好 600 秒一首算單曲；短影片但有兩首不算
  k := pg_temp.cat_k('zzCeBound60');
  IF k IS DISTINCT FROM 'single' THEN RAISE EXCEPTION 'SQL10 失敗：剛好 600 秒一首的影片 k 應為 single，得 %', k; END IF;

  k := pg_temp.cat_k('zzCeShort21');
  IF k IS DISTINCT FROM 'stream' THEN RAISE EXCEPTION 'SQL10 失敗：5 分鐘但有兩首的影片 k 應為 stream，得 %', k; END IF;

  -- 字典元素（只有 songs 欄）不該帶 k
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.get_song_catalog()::jsonb) e WHERE e ? 'songs' AND e ? 'k') THEN
    RAISE EXCEPTION 'SQL10 失敗：尾端歌曲字典不該有 k';
  END IF;
  RAISE NOTICE 'ok SQL10 目錄標出單曲（single／stream）';
END $$;

\echo 'song_community_edit：全部通過'
ROLLBACK;
