-- 歌回播放清單 v1.3：歌曲本體（songs／song_keys）、自動配對、後台整理 RPC 的行為與權限測試（S1～S20）。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/song_library.sql
-- 整檔在一個交易內，結尾 ROLLBACK，不留下任何資料。斷言失敗一律 RAISE EXCEPTION（ON_ERROR_STOP 讓 psql 以非 0 結束）。
--
-- 對規格的假設（規格沒寫死，實作若不同請回頭對齊測試或規格）：
--   A1 沒有原唱＝original_artist 為 NULL，鍵上以空字串表示（artist_key = ''）。
--   A2 _save_song_video 回傳的 segments[i] 帶 song_id、version_note、song{id,title,artist,versions}；versions 是該歌的版本數（數字；陣列則取長度）。
--   A3 admin_match_songs 輸入 [{title, original_artist}]，回傳與輸入同順序的 jsonb 陣列，
--      每項 {status: 'existing'|'new'|'similar', song_id?}；similar＝歌名鍵相同但原唱鍵不同。
--   A4 admin_search_songs／admin_song_duplicates／admin_get_song 只驗輸出文字含關鍵字串（不綁定回傳型別）。
--   A5 疑似重複＝歌名鍵相同但原唱不同的兩首歌。
--   A6 遇到延後執行的孤兒清除 trigger：每次檢查前才 SET CONSTRAINTS ALL IMMEDIATE，檢查完立刻改回 DEFERRED，
--      避免 _song_for() 內部「先建歌、後插片段」的過程中新歌被當孤兒刪掉。

BEGIN;

SET CONSTRAINTS ALL DEFERRED;

-- ───────────── 測試輔助（pg_temp，ROLLBACK 後消失） ─────────────
-- 一律用 plpgsql：函式本體延後解析，物件尚未存在時整檔仍能載入，失敗點落在各自的斷言。
CREATE FUNCTION pg_temp.song_of(p_seg uuid) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r bigint;
BEGIN
  SELECT song_id INTO r FROM public.song_segments WHERE id = p_seg;
  RETURN r;
END $$;

-- 預期 p_sql 丟錯，且 SQLERRM 含 p_code（沒丟錯、或丟的是別的錯都算失敗）
CREATE FUNCTION pg_temp.expect_err(p_tag text, p_sql text, p_code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_err text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  IF v_err IS NULL THEN
    RAISE EXCEPTION '% 失敗：預期錯誤「%」，但呼叫成功了（%）', p_tag, p_code, p_sql;
  END IF;
  IF position(p_code IN v_err) = 0 THEN
    RAISE EXCEPTION '% 失敗：預期錯誤含「%」，實得「%」', p_tag, p_code, v_err;
  END IF;
END $$;

-- 清除孤兒歌曲的 deferred trigger：只在這裡強制觸發一次，之後改回延後
CREATE FUNCTION pg_temp.flush() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
END $$;

-- ───────────── S1 寫法不同、正規化後相同 ─────────────
-- S1
DO $$
BEGIN
  IF public.song_norm_text('ＡＢＣ　Ｄｅｆ') IS DISTINCT FROM public.song_norm_text('abc def') THEN
    RAISE EXCEPTION 'S1 失敗：全形與半形、大小寫應正規化成同一個鍵';
  END IF;
  IF public.song_norm_text('Hello, World!') IS DISTINCT FROM public.song_norm_text('hello world') THEN
    RAISE EXCEPTION 'S1 失敗：標點與空白差異應被忽略';
  END IF;
  IF public.song_norm_text('想你時風起！') IS DISTINCT FROM public.song_norm_text('想你時風起') THEN
    RAISE EXCEPTION 'S1 失敗：結尾全形標點應被忽略';
  END IF;
  IF public.song_norm_text('想你時風起') IS NOT DISTINCT FROM public.song_norm_text('想你時風') THEN
    RAISE EXCEPTION 'S1 失敗：不同歌名不可正規化成同一個鍵';
  END IF;
  IF public.song_norm_text('abc') IS NOT DISTINCT FROM public.song_norm_text('abd') THEN
    RAISE EXCEPTION 'S1 失敗：不同歌名不可正規化成同一個鍵（abc／abd）';
  END IF;
  RAISE NOTICE 'S1 ok';
END $$;

-- ───────────── S2 版本括號去除、(feat.) 保留 ─────────────
-- S2
DO $$
DECLARE suffix text; base text := public.song_norm_text('測試歌');
BEGIN
  FOREACH suffix IN ARRAY ARRAY[' (Acoustic ver.)', ' (cover)', ' (live)', '（清唱）', ' (練歌版)', ' (合唱)', ' (重唱)', '（歌ってみた）'] LOOP
    IF public.song_norm_text('測試歌' || suffix) IS DISTINCT FROM base THEN
      RAISE EXCEPTION 'S2 失敗：結尾版本括號「%」應被去除，得 %', suffix, public.song_norm_text('測試歌' || suffix);
    END IF;
  END LOOP;
  IF public.song_norm_text('測試歌 (cover) (live) (清唱)') IS DISTINCT FROM base THEN
    RAISE EXCEPTION 'S2 失敗：連續 3 組版本括號都應去除';
  END IF;
  IF public.song_norm_text('測試歌 (feat. 某人)') IS NOT DISTINCT FROM base THEN
    RAISE EXCEPTION 'S2 失敗：(feat.) 括號必須保留，不可和無 feat 的歌同鍵';
  END IF;
  IF public.song_norm_text('測試歌 (feat. 某人) (Live ver.)') IS DISTINCT FROM public.song_norm_text('測試歌 (feat. 某人)') THEN
    RAISE EXCEPTION 'S2 失敗：版本括號去除後應剩 feat 括號';
  END IF;
  RAISE NOTICE 'S2 ok';
END $$;

-- ───────────── S3 全符號歌名不變空字串 ─────────────
-- S3
DO $$
BEGIN
  IF coalesce(public.song_norm_text('！！！'), '') = '' THEN
    RAISE EXCEPTION 'S3 失敗：全符號歌名「！！！」正規化後不可為空字串';
  END IF;
  IF coalesce(public.song_norm_text('(Live ver.)'), '') = '' THEN
    RAISE EXCEPTION 'S3 失敗：整個歌名都是版本括號時應退回括號前的結果，不可為空字串';
  END IF;
  RAISE NOTICE 'S3 ok';
END $$;

-- ───────────── S11 既有資料經回填後：每段都有歌、鍵一致、沒有孤兒歌 ─────────────
-- （放在建測資之前，檢查的是 migration 後的既有資料；空庫也能通過）
-- S11
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.song_segments WHERE song_id IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'S11 失敗：% 段沒有 song_id', n; END IF;

  SELECT count(*) INTO n FROM public.songs s
   WHERE NOT EXISTS (SELECT 1 FROM public.song_segments g WHERE g.song_id = s.id);
  IF n <> 0 THEN RAISE EXCEPTION 'S11 失敗：回填後有 % 首孤兒歌（沒有任何片段）', n; END IF;

  SELECT count(*) INTO n FROM public.song_segments g
   WHERE NOT EXISTS (
     SELECT 1 FROM public.song_keys k
      WHERE k.song_id = g.song_id
        AND k.title_key = public.song_norm_text(g.title)
        AND k.artist_key = coalesce(public.song_norm_text(g.original_artist), ''));
  IF n <> 0 THEN RAISE EXCEPTION 'S11 失敗：% 段的正規化鍵沒有登記在它所屬的歌底下', n; END IF;

  -- 同一組鍵只屬於一首歌：依鍵分組後，每組片段的 song_id 都相同
  SELECT count(*) INTO n FROM (
    SELECT public.song_norm_text(title) AS tk, coalesce(public.song_norm_text(original_artist), '') AS ak
      FROM public.song_segments
     GROUP BY 1, 2
    HAVING count(DISTINCT song_id) > 1) x;
  IF n <> 0 THEN RAISE EXCEPTION 'S11 失敗：% 組相同的鍵被分在不同首歌', n; END IF;
  RAISE NOTICE 'S11 ok';
END $$;

-- ───────────── 測資 ─────────────
-- 影片 a001／a002 已發布，a003 草稿；片段 id 固定為 …b0NN
INSERT INTO public.song_videos (id, video_id, title, streamed_at, status) VALUES
  ('00000000-0000-4000-8000-00000000a001', 'zzTestVid01', 'zz 測試歌回一', '2026-01-01T12:00:00Z', 'published'),
  ('00000000-0000-4000-8000-00000000a002', 'zzTestVid02', 'zz 測試歌回二', '2026-01-02T12:00:00Z', 'published'),
  ('00000000-0000-4000-8000-00000000a003', 'zzTestVid03', 'zz 草稿歌回', '2026-01-03T12:00:00Z', 'draft');

-- 逐筆插入（不靠同一個 INSERT 內的列順序）
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a001', 0, 100, 'zz想你時風起', 'zz原唱甲', 0);
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000a002', 0, 100, 'ＺＺ想你時風起 (Live ver.)', 'ZZ原唱甲', 0);
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000a001', 100, 200, 'zz想你時風起', NULL, 1);
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-00000000a002', 100, 200, 'zz想你時風起（清唱）', NULL, 1);

-- ───────────── S4 新片段自動建歌、跨歌回配同一首 ─────────────
-- S4
DO $$
DECLARE a bigint; b bigint; n integer;
BEGIN
  a := pg_temp.song_of('00000000-0000-4000-8000-00000000b001');
  b := pg_temp.song_of('00000000-0000-4000-8000-00000000b002');
  IF a IS NULL THEN RAISE EXCEPTION 'S4 失敗：新片段沒有被自動配上 song_id'; END IF;
  IF a IS DISTINCT FROM b THEN
    RAISE EXCEPTION 'S4 失敗：兩場歌回的同名同原唱（寫法不同）應配到同一首歌，得 % 與 %', a, b;
  END IF;
  IF (SELECT title FROM public.songs WHERE id = a) IS DISTINCT FROM 'zz想你時風起' THEN
    RAISE EXCEPTION 'S4 失敗：新歌的名稱應取最早寫入那一段的歌名，得 %', (SELECT title FROM public.songs WHERE id = a);
  END IF;
  IF (SELECT original_artist FROM public.songs WHERE id = a) IS DISTINCT FROM 'zz原唱甲' THEN
    RAISE EXCEPTION 'S4 失敗：新歌的原唱應取最早寫入那一段的原唱';
  END IF;
  SELECT count(*) INTO n FROM public.song_keys WHERE song_id = a;
  IF n <> 1 THEN RAISE EXCEPTION 'S4 失敗：自動建的歌應只有 1 組鍵，得 %', n; END IF;
  RAISE NOTICE 'S4 ok';
END $$;

-- ───────────── S5 原唱空白不與有原唱的合併 ─────────────
-- S5
DO $$
DECLARE a bigint; c1 bigint; c2 bigint;
BEGIN
  a  := pg_temp.song_of('00000000-0000-4000-8000-00000000b001');
  c1 := pg_temp.song_of('00000000-0000-4000-8000-00000000b003');
  c2 := pg_temp.song_of('00000000-0000-4000-8000-00000000b004');
  IF c1 IS NULL OR c1 = a THEN
    RAISE EXCEPTION 'S5 失敗：原唱空白的片段不可配到有原唱的歌（c1=% a=%）', c1, a;
  END IF;
  IF c1 IS DISTINCT FROM c2 THEN
    RAISE EXCEPTION 'S5 失敗：兩段原唱都空白的同名歌應配到同一首，得 % 與 %', c1, c2;
  END IF;
  RAISE NOTICE 'S5 ok';
END $$;

-- ───────────── S6 改歌名換鍵 → 重新配對，舊歌被清掉 ─────────────
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b005', '00000000-0000-4000-8000-00000000a001', 200, 300, 'zzS6舊名', 'zz原唱甲', 2);

-- S6
DO $$
DECLARE old_song bigint; a bigint; old_code text;
BEGIN
  old_song := pg_temp.song_of('00000000-0000-4000-8000-00000000b005');
  a := pg_temp.song_of('00000000-0000-4000-8000-00000000b001');
  IF old_song IS NULL OR old_song = a THEN RAISE EXCEPTION 'S6 失敗：前置條件不成立（舊名應自成一首歌）'; END IF;
  SELECT code INTO old_code FROM public.song_segments WHERE id = '00000000-0000-4000-8000-00000000b005';

  UPDATE public.song_segments SET title = 'zz想你時風起' WHERE id = '00000000-0000-4000-8000-00000000b005';

  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b005') IS DISTINCT FROM a THEN
    RAISE EXCEPTION 'S6 失敗：改成已存在的歌名後應重新配到該歌（預期 %，得 %）', a, pg_temp.song_of('00000000-0000-4000-8000-00000000b005');
  END IF;
  IF (SELECT code FROM public.song_segments WHERE id = '00000000-0000-4000-8000-00000000b005') IS DISTINCT FROM old_code THEN
    RAISE EXCEPTION 'S6 失敗：改名不可改變分享用的 code';
  END IF;

  PERFORM pg_temp.flush();
  IF EXISTS (SELECT 1 FROM public.songs WHERE id = old_song) THEN
    RAISE EXCEPTION 'S6 失敗：舊歌已沒有任何片段，應被清除';
  END IF;
  IF EXISTS (SELECT 1 FROM public.song_keys WHERE song_id = old_song) THEN
    RAISE EXCEPTION 'S6 失敗：舊歌被清除後它的鍵也應一起刪除';
  END IF;
  RAISE NOTICE 'S6 ok';
END $$;

-- ───────────── S7 不換鍵就保留歸屬 ─────────────
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-00000000a002', 200, 300, 'zzS7歌', 'zz原唱乙', 2);

-- S7
DO $$
DECLARE s bigint; c text; n_before integer; n_after integer;
BEGIN
  s := pg_temp.song_of('00000000-0000-4000-8000-00000000b006');
  SELECT code INTO c FROM public.song_segments WHERE id = '00000000-0000-4000-8000-00000000b006';
  SELECT count(*) INTO n_before FROM public.songs;

  UPDATE public.song_segments SET version_note = '清唱', start_seconds = 201
   WHERE id = '00000000-0000-4000-8000-00000000b006';
  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b006') IS DISTINCT FROM s THEN
    RAISE EXCEPTION 'S7 失敗：只改備註與時間，song_id 不該變';
  END IF;

  -- 歌名換了寫法但正規化鍵相同 → 仍留在原本那首
  UPDATE public.song_segments SET title = 'ＺＺＳ７歌 (Live ver.)', original_artist = 'ZZ原唱乙'
   WHERE id = '00000000-0000-4000-8000-00000000b006';
  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b006') IS DISTINCT FROM s THEN
    RAISE EXCEPTION 'S7 失敗：鍵沒變（只是寫法不同），song_id 不該變';
  END IF;
  IF (SELECT code FROM public.song_segments WHERE id = '00000000-0000-4000-8000-00000000b006') IS DISTINCT FROM c THEN
    RAISE EXCEPTION 'S7 失敗：code 不該變';
  END IF;

  PERFORM pg_temp.flush();
  SELECT count(*) INTO n_after FROM public.songs;
  IF n_after <> n_before THEN
    RAISE EXCEPTION 'S7 失敗：沒換鍵的更新不該新增或刪除歌曲（% → %）', n_before, n_after;
  END IF;
  RAISE NOTICE 'S7 ok';
END $$;

-- ───────────── S8 存檔 RPC 回傳帶歌與備註 ─────────────
-- S8
DO $$
DECLARE r jsonb; seg jsonb; a bigint; v_cnt integer; v_versions integer; vid uuid; r2 jsonb;
BEGIN
  a := pg_temp.song_of('00000000-0000-4000-8000-00000000b001');
  r := public._save_song_video(
         NULL,
         jsonb_build_object('video_id', 'zzTestVid04', 'title', 'zz S8 歌回', 'status', 'published'),
         jsonb_build_array(
           jsonb_build_object('start_seconds', 0, 'end_seconds', 60, 'title', 'zz想你時風起',
                              'original_artist', 'zz原唱甲', 'position', 0, 'version_note', '合唱'),
           jsonb_build_object('start_seconds', 60, 'end_seconds', 120, 'title', 'zzS8獨有',
                              'original_artist', NULL, 'position', 1)))::jsonb;
  vid := (r->>'id')::uuid;
  seg := r->'segments'->0;
  IF (seg->>'song_id')::bigint IS DISTINCT FROM a THEN
    RAISE EXCEPTION 'S8 失敗：回傳片段的 song_id 應為既有的歌 %，得 %', a, seg->>'song_id';
  END IF;
  IF seg->>'version_note' IS DISTINCT FROM '合唱' THEN
    RAISE EXCEPTION 'S8 失敗：回傳片段應帶 version_note=合唱，得 %', seg->>'version_note';
  END IF;
  IF (seg->'song'->>'id')::bigint IS DISTINCT FROM a
     OR seg->'song'->>'title' IS DISTINCT FROM (SELECT title FROM public.songs WHERE id = a)
     OR seg->'song'->>'artist' IS DISTINCT FROM 'zz原唱甲' THEN
    RAISE EXCEPTION 'S8 失敗：回傳片段應帶 song{id,title,artist}，得 %', seg->'song';
  END IF;
  SELECT count(*) INTO v_cnt FROM public.song_segments WHERE song_id = a;
  v_versions := CASE jsonb_typeof(seg->'song'->'versions')
                  WHEN 'number' THEN (seg->'song'->>'versions')::integer
                  WHEN 'array'  THEN jsonb_array_length(seg->'song'->'versions') END;
  IF v_versions IS DISTINCT FROM v_cnt THEN
    RAISE EXCEPTION 'S8 失敗：song.versions 應等於該歌的版本數 %，得 %', v_cnt, seg->'song'->'versions';
  END IF;
  IF (r->'segments'->1->>'version_note') IS NOT NULL THEN
    RAISE EXCEPTION 'S8 失敗：沒填備註的片段 version_note 應為 null';
  END IF;
  IF (SELECT version_note FROM public.song_segments WHERE id = (seg->>'id')::uuid) IS DISTINCT FROM '合唱' THEN
    RAISE EXCEPTION 'S8 失敗：version_note 沒有寫進資料表';
  END IF;

  -- 依 id 原地更新備註：code、song_id 不變
  r2 := public._save_song_video(
          vid,
          jsonb_build_object('video_id', 'zzTestVid04', 'title', 'zz S8 歌回', 'status', 'published'),
          jsonb_build_array(
            jsonb_build_object('id', seg->>'id', 'start_seconds', 0, 'end_seconds', 60, 'title', 'zz想你時風起',
                               'original_artist', 'zz原唱甲', 'position', 0, 'version_note', '清唱'),
            jsonb_build_object('id', r->'segments'->1->>'id', 'start_seconds', 60, 'end_seconds', 120,
                               'title', 'zzS8獨有', 'original_artist', NULL, 'position', 1)))::jsonb;
  IF r2->'segments'->0->>'version_note' IS DISTINCT FROM '清唱' THEN
    RAISE EXCEPTION 'S8 失敗：更新後 version_note 應為清唱，得 %', r2->'segments'->0->>'version_note';
  END IF;
  IF r2->'segments'->0->>'code' IS DISTINCT FROM seg->>'code'
     OR (r2->'segments'->0->>'song_id')::bigint IS DISTINCT FROM a THEN
    RAISE EXCEPTION 'S8 失敗：只改備註，code 與 song_id 不該變';
  END IF;
  RAISE NOTICE 'S8 ok';
END $$;

-- ───────────── S9 刪片段、刪影片 → 孤兒歌被清 ─────────────
-- S9
DO $$
DECLARE vid uuid; seg_id text; a bigint; r jsonb;
BEGIN
  SELECT id INTO vid FROM public.song_videos WHERE video_id = 'zzTestVid04';
  SELECT id::text INTO seg_id FROM public.song_segments WHERE video_ref = vid AND title = 'zz想你時風起';
  a := pg_temp.song_of(seg_id::uuid);
  IF NOT EXISTS (SELECT 1 FROM public.songs WHERE title = 'zzS8獨有') THEN
    RAISE EXCEPTION 'S9 失敗：前置條件不成立（zzS8獨有 應已自動建歌）';
  END IF;

  -- (1) 存檔時把「zzS8獨有」那段拿掉
  PERFORM public._save_song_video(
            vid,
            jsonb_build_object('video_id', 'zzTestVid04', 'title', 'zz S8 歌回', 'status', 'published'),
            jsonb_build_array(
              jsonb_build_object('id', seg_id, 'start_seconds', 0, 'end_seconds', 60, 'title', 'zz想你時風起',
                                 'original_artist', 'zz原唱甲', 'position', 0, 'version_note', '清唱')));
  PERFORM pg_temp.flush();
  IF EXISTS (SELECT 1 FROM public.songs WHERE title = 'zzS8獨有') THEN
    RAISE EXCEPTION 'S9 失敗：刪掉唯一的片段後，zzS8獨有 這首歌應被清除';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.songs WHERE id = a) THEN
    RAISE EXCEPTION 'S9 失敗：還有別的片段引用的歌（想你時風起）不可被清除';
  END IF;

  -- (2) 整支影片刪除（片段 cascade）
  PERFORM public._save_song_video(
            vid,
            jsonb_build_object('video_id', 'zzTestVid04', 'title', 'zz S8 歌回', 'status', 'published'),
            jsonb_build_array(
              jsonb_build_object('id', seg_id, 'start_seconds', 0, 'end_seconds', 60, 'title', 'zz想你時風起',
                                 'original_artist', 'zz原唱甲', 'position', 0, 'version_note', '清唱'),
              jsonb_build_object('start_seconds', 60, 'end_seconds', 120, 'title', 'zzS9獨有',
                                 'original_artist', NULL, 'position', 1)));
  IF NOT EXISTS (SELECT 1 FROM public.songs WHERE title = 'zzS9獨有') THEN
    RAISE EXCEPTION 'S9 失敗：前置條件不成立（zzS9獨有 應已自動建歌）';
  END IF;
  DELETE FROM public.song_videos WHERE id = vid;
  PERFORM pg_temp.flush();
  IF EXISTS (SELECT 1 FROM public.songs WHERE title = 'zzS9獨有') THEN
    RAISE EXCEPTION 'S9 失敗：刪除影片後，只被它引用的歌應被清除';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.songs WHERE id = a) THEN
    RAISE EXCEPTION 'S9 失敗：刪除影片不可連累其他影片還在用的歌';
  END IF;
  RAISE NOTICE 'S9 ok';
END $$;

-- ───────────── S10 核准投稿：配到既有的歌，備註寫入 ─────────────
INSERT INTO public.song_submissions (id, kind, video_id, title, segments, ip_hash) VALUES
  ('00000000-0000-4000-8000-00000000c001', 'new', 'zzTestVid05', 'zz S10 投稿歌回',
   '[{"start_seconds":0,"end_seconds":60,"title":"x","position":0}]'::jsonb, 'zzzzzzzzzzzzzzzz');

-- S10
DO $$
DECLARE r jsonb; a bigint; seg jsonb;
BEGIN
  a := pg_temp.song_of('00000000-0000-4000-8000-00000000b001');
  r := public.approve_song_submission(
         '00000000-0000-4000-8000-00000000c001', NULL,
         jsonb_build_object('video_id', 'zzTestVid05', 'title', 'zz S10 投稿歌回', 'status', 'published'),
         jsonb_build_array(
           jsonb_build_object('start_seconds', 0, 'end_seconds', 60, 'title', 'ＺＺ想你時風起',
                              'original_artist', 'zz原唱甲', 'position', 0, 'version_note', '練歌版')))::jsonb;
  seg := r->'segments'->0;
  IF (seg->>'song_id')::bigint IS DISTINCT FROM a THEN
    RAISE EXCEPTION 'S10 失敗：核准投稿的片段應配到既有的歌 %，得 %', a, seg->>'song_id';
  END IF;
  IF seg->>'version_note' IS DISTINCT FROM '練歌版'
     OR (SELECT version_note FROM public.song_segments WHERE id = (seg->>'id')::uuid) IS DISTINCT FROM '練歌版' THEN
    RAISE EXCEPTION 'S10 失敗：投稿的版本備註應寫入並回傳';
  END IF;
  IF (SELECT status FROM public.song_submissions WHERE id = '00000000-0000-4000-8000-00000000c001') <> 'approved' THEN
    RAISE EXCEPTION 'S10 失敗：投稿應標記為 approved';
  END IF;
  RAISE NOTICE 'S10 ok';
END $$;

-- ───────────── S12 合併：鍵與片段搬到目標，之後同名歌配到目標 ─────────────
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-00000000a001', 300, 400, 'zzS12甲', 'zz歌手丙', 3);
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b008', '00000000-0000-4000-8000-00000000a002', 300, 400, 'zzS12甲繁', 'zz歌手丙', 3);

-- S12
DO $$
DECLARE target bigint; source bigint; n integer;
BEGIN
  target := pg_temp.song_of('00000000-0000-4000-8000-00000000b007');
  source := pg_temp.song_of('00000000-0000-4000-8000-00000000b008');
  IF target IS NULL OR source IS NULL OR target = source THEN
    RAISE EXCEPTION 'S12 失敗：前置條件不成立（寫法不同的兩首應先是兩首歌）';
  END IF;

  PERFORM public.admin_merge_songs(source, target, false);
  PERFORM pg_temp.flush();

  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b008') IS DISTINCT FROM target THEN
    RAISE EXCEPTION 'S12 失敗：來源歌的片段應搬到目標歌';
  END IF;
  IF EXISTS (SELECT 1 FROM public.songs WHERE id = source) THEN
    RAISE EXCEPTION 'S12 失敗：合併後來源歌應消失';
  END IF;
  IF (SELECT title FROM public.songs WHERE id = target) IS DISTINCT FROM 'zzS12甲' THEN
    RAISE EXCEPTION 'S12 失敗：名稱應保留目標歌的，得 %', (SELECT title FROM public.songs WHERE id = target);
  END IF;
  SELECT count(*) INTO n FROM public.song_keys WHERE song_id = target;
  IF n <> 2 THEN RAISE EXCEPTION 'S12 失敗：目標歌應有 2 組鍵（原本的＋來源搬來的別名），得 %', n; END IF;

  -- 之後有人用來源歌的寫法新增片段，要自動配到目標歌
  INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
    ('00000000-0000-4000-8000-00000000b009', '00000000-0000-4000-8000-00000000a001', 400, 500, 'ＺＺＳ１２甲繁', 'zz歌手丙', 4);
  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b009') IS DISTINCT FROM target THEN
    RAISE EXCEPTION 'S12 失敗：合併後，來源歌的別名鍵應讓新片段自動配到目標歌';
  END IF;
  RAISE NOTICE 'S12 ok';
END $$;

-- ───────────── S13 誤合被擋（錯誤代碼）與強制合併 ─────────────
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b010', '00000000-0000-4000-8000-00000000a001', 500, 600, 'zzS13同名', 'zz歌手丁', 5);
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b011', '00000000-0000-4000-8000-00000000a002', 500, 600, 'zzS13同名', 'zz歌手戊', 5);

-- S13
DO $$
DECLARE g1 bigint; g2 bigint;
BEGIN
  g1 := pg_temp.song_of('00000000-0000-4000-8000-00000000b010');
  g2 := pg_temp.song_of('00000000-0000-4000-8000-00000000b011');
  IF g1 IS NULL OR g2 IS NULL OR g1 = g2 THEN
    RAISE EXCEPTION 'S13 失敗：前置條件不成立（同名不同原唱應是兩首歌）';
  END IF;

  PERFORM pg_temp.expect_err('S13', format('select public.admin_merge_songs(%s, %s, false)', g1, g1), 'same_song');
  PERFORM pg_temp.expect_err('S13', format('select public.admin_merge_songs(%s, %s, false)', 999999999, g1), 'song_not_found');
  PERFORM pg_temp.expect_err('S13', format('select public.admin_merge_songs(%s, %s, false)', g1, 999999999), 'song_not_found');
  PERFORM pg_temp.expect_err('S13', format('select public.admin_merge_songs(%s, %s, false)', g2, g1), 'artist_mismatch');

  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b011') IS DISTINCT FROM g2 THEN
    RAISE EXCEPTION 'S13 失敗：被擋下的合併不可搬動任何片段';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.songs WHERE id = g2) THEN
    RAISE EXCEPTION 'S13 失敗：被擋下的合併不可刪掉來源歌';
  END IF;

  PERFORM public.admin_merge_songs(g2, g1, true);
  PERFORM pg_temp.flush();
  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b011') IS DISTINCT FROM g1 THEN
    RAISE EXCEPTION 'S13 失敗：帶 allow_artist_mismatch=true 時應可合併';
  END IF;
  IF (SELECT original_artist FROM public.songs WHERE id = g1) IS DISTINCT FROM 'zz歌手丁' THEN
    RAISE EXCEPTION 'S13 失敗：強制合併後仍應保留目標歌的原唱';
  END IF;
  RAISE NOTICE 'S13 ok';
END $$;

-- ───────────── S14 拆開：歸屬保留、不加鍵 ─────────────
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b012', '00000000-0000-4000-8000-00000000a001', 600, 700, 'zzS14歌', 'zz歌手己', 6);
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b013', '00000000-0000-4000-8000-00000000a002', 600, 700, 'zzS14歌', 'zz歌手己', 6);

-- S14
DO $$
DECLARE h1 bigint; h2 bigint; new_song bigint;
BEGIN
  h1 := pg_temp.song_of('00000000-0000-4000-8000-00000000b012');
  IF h1 IS DISTINCT FROM pg_temp.song_of('00000000-0000-4000-8000-00000000b013') THEN
    RAISE EXCEPTION 'S14 失敗：前置條件不成立（兩段應先在同一首歌）';
  END IF;

  PERFORM public.admin_split_segment('00000000-0000-4000-8000-00000000b013');
  new_song := pg_temp.song_of('00000000-0000-4000-8000-00000000b013');
  IF new_song IS NULL OR new_song = h1 THEN
    RAISE EXCEPTION 'S14 失敗：拆開後該版本應屬於一首新歌（得 %，原歌 %）', new_song, h1;
  END IF;
  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b012') IS DISTINCT FROM h1 THEN
    RAISE EXCEPTION 'S14 失敗：其他版本的歸屬不該變';
  END IF;
  IF (SELECT title FROM public.songs WHERE id = new_song) IS DISTINCT FROM 'zzS14歌'
     OR (SELECT original_artist FROM public.songs WHERE id = new_song) IS DISTINCT FROM 'zz歌手己' THEN
    RAISE EXCEPTION 'S14 失敗：新歌的名稱與原唱應沿用該版本的';
  END IF;
  IF EXISTS (SELECT 1 FROM public.song_keys WHERE song_id = new_song) THEN
    RAISE EXCEPTION 'S14 失敗：拆開出來的新歌不該加鍵';
  END IF;

  -- 之後改備註（鍵沒變）→ 不可又被自動配回原歌
  UPDATE public.song_segments SET version_note = '拆開後的備註' WHERE id = '00000000-0000-4000-8000-00000000b013';
  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b013') IS DISTINCT FROM new_song THEN
    RAISE EXCEPTION 'S14 失敗：拆開後只改備註，歸屬不可被重新配對回原歌';
  END IF;

  -- 之後同名的新片段仍配到持有鍵的原歌
  INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
    ('00000000-0000-4000-8000-00000000b014', '00000000-0000-4000-8000-00000000a001', 700, 800, 'zzS14歌', 'zz歌手己', 7);
  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b014') IS DISTINCT FROM h1 THEN
    RAISE EXCEPTION 'S14 失敗：同名新片段應配到持有鍵的原歌，不是拆出來的那首';
  END IF;

  PERFORM pg_temp.expect_err('S14', $q$select public.admin_split_segment('00000000-0000-4000-8000-00000000b013')$q$, 'already_single');
  PERFORM pg_temp.expect_err('S14', $q$select public.admin_split_segment('00000000-0000-4000-8000-00000000ffff')$q$, 'segment_not_found');
  RAISE NOTICE 'S14 ok';
END $$;

-- ───────────── S15 改名：加新鍵、舊鍵保留；key_taken ─────────────
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b015', '00000000-0000-4000-8000-00000000a001', 800, 900, 'zzS15舊名', 'zz歌手庚', 8);
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b018', '00000000-0000-4000-8000-00000000a001', 900, 1000, 'zzS15另一首', 'zz歌手庚', 9);

-- S15
DO $$
DECLARE r bigint; q bigint;
BEGIN
  r := pg_temp.song_of('00000000-0000-4000-8000-00000000b015');
  q := pg_temp.song_of('00000000-0000-4000-8000-00000000b018');
  IF r IS NULL OR q IS NULL OR r = q THEN RAISE EXCEPTION 'S15 失敗：前置條件不成立'; END IF;

  PERFORM public.admin_rename_song(r, 'zzS15新名', 'zz歌手庚');
  IF (SELECT title FROM public.songs WHERE id = r) IS DISTINCT FROM 'zzS15新名' THEN
    RAISE EXCEPTION 'S15 失敗：歌名應改為新名，得 %', (SELECT title FROM public.songs WHERE id = r);
  END IF;
  IF (SELECT count(*) FROM public.song_keys WHERE song_id = r) <> 2 THEN
    RAISE EXCEPTION 'S15 失敗：改名後應同時有舊鍵與新鍵共 2 組，得 %', (SELECT count(*) FROM public.song_keys WHERE song_id = r);
  END IF;

  INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
    ('00000000-0000-4000-8000-00000000b016', '00000000-0000-4000-8000-00000000a002', 800, 900, 'zzS15新名', 'zz歌手庚', 8);
  INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
    ('00000000-0000-4000-8000-00000000b017', '00000000-0000-4000-8000-00000000a002', 900, 1000, 'zzS15舊名', 'zz歌手庚', 9);
  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b016') IS DISTINCT FROM r THEN
    RAISE EXCEPTION 'S15 失敗：用新名寫的片段應配到改名後的歌';
  END IF;
  IF pg_temp.song_of('00000000-0000-4000-8000-00000000b017') IS DISTINCT FROM r THEN
    RAISE EXCEPTION 'S15 失敗：舊鍵要保留，用舊名寫的片段仍應配到同一首歌';
  END IF;

  PERFORM pg_temp.expect_err('S15', format('select public.admin_rename_song(%s, %L, %L)', q, 'zzS15新名', 'zz歌手庚'), 'key_taken');
  IF (SELECT title FROM public.songs WHERE id = q) IS DISTINCT FROM 'zzS15另一首' THEN
    RAISE EXCEPTION 'S15 失敗：key_taken 被擋下時，歌名不可被改';
  END IF;
  PERFORM pg_temp.expect_err('S15', format('select public.admin_rename_song(%s, %L, %L)', 999999999, 'x', 'y'), 'song_not_found');
  RAISE NOTICE 'S15 ok';
END $$;

-- ───────────── S16 配對預覽：順序與 existing／new／similar ─────────────
-- S16
DO $$
DECLARE r jsonb; a bigint; n_before integer;
BEGIN
  a := pg_temp.song_of('00000000-0000-4000-8000-00000000b001');
  SELECT count(*) INTO n_before FROM public.songs;
  r := public.admin_match_songs(jsonb_build_array(
         jsonb_build_object('title', 'ＺＺ想你時風起 (Live ver.)', 'original_artist', 'zz原唱甲'),
         jsonb_build_object('title', 'zzS16 絕對沒有的歌', 'original_artist', 'zz原唱甲'),
         jsonb_build_object('title', 'zz想你時風起', 'original_artist', 'zz另一位歌手')));
  IF jsonb_array_length(r) <> 3 THEN
    RAISE EXCEPTION 'S16 失敗：回傳筆數應與輸入相同（3），得 %', r;
  END IF;
  IF r->0->>'status' IS DISTINCT FROM 'existing' OR (r->0->>'song_id')::bigint IS DISTINCT FROM a THEN
    RAISE EXCEPTION 'S16 失敗：第 1 項應為 existing 並帶 song_id=%，得 %', a, r->0;
  END IF;
  IF r->1->>'status' IS DISTINCT FROM 'new' THEN
    RAISE EXCEPTION 'S16 失敗：第 2 項應為 new，得 %', r->1;
  END IF;
  IF r->2->>'status' IS DISTINCT FROM 'similar' THEN
    RAISE EXCEPTION 'S16 失敗：第 3 項（同名不同原唱）應為 similar，得 %', r->2;
  END IF;
  IF (SELECT count(*) FROM public.songs) <> n_before THEN
    RAISE EXCEPTION 'S16 失敗：配對預覽不可建立任何歌';
  END IF;
  RAISE NOTICE 'S16 ok';
END $$;

-- ───────────── S16b 搜尋、疑似重複、單曲明細（規格表未編號，歸在 S12–S16 的後台 RPC） ─────────────
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b019', '00000000-0000-4000-8000-00000000a001', 1000, 1100, 'zzS16b同名', 'zz歌手甲', 10);
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position) VALUES
  ('00000000-0000-4000-8000-00000000b01a', '00000000-0000-4000-8000-00000000a002', 1000, 1100, 'zzS16b同名', 'zz歌手乙', 10);

-- S16b
DO $$
DECLARE s1 bigint; code1 text; t text;
BEGIN
  s1 := pg_temp.song_of('00000000-0000-4000-8000-00000000b019');
  SELECT code INTO code1 FROM public.song_segments WHERE id = '00000000-0000-4000-8000-00000000b019';

  SELECT string_agg(x::text, E'\n') INTO t FROM (SELECT public.admin_search_songs('zzS15', 10) AS x) q;
  IF t IS NULL OR position('zzS15新名' IN t) = 0 THEN
    RAISE EXCEPTION 'S16b 失敗：admin_search_songs 應找到歌名含 zzS15 的歌，得 %', t;
  END IF;

  SELECT string_agg(x::text, E'\n') INTO t FROM (SELECT public.admin_song_duplicates(200) AS x) q;
  IF t IS NULL OR position('zzS16b同名' IN t) = 0 THEN
    RAISE EXCEPTION 'S16b 失敗：admin_song_duplicates 應列出同名不同原唱的 zzS16b同名，得 %', t;
  END IF;

  SELECT string_agg(x::text, E'\n') INTO t FROM (SELECT public.admin_get_song(s1) AS x) q;
  IF t IS NULL OR position('zzS16b同名' IN t) = 0 OR position(code1 IN t) = 0 THEN
    RAISE EXCEPTION 'S16b 失敗：admin_get_song 應含歌名與其版本的 code，得 %', t;
  END IF;
  RAISE NOTICE 'S16b ok';
END $$;

-- ───────────── S17 目錄：片段 8 欄＋尾端歌曲字典 ─────────────
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position, version_note) VALUES
  ('00000000-0000-4000-8000-00000000b01b', '00000000-0000-4000-8000-00000000a003', 0, 100, 'zzS17草稿歌', NULL, 0, NULL);
INSERT INTO public.song_segments (id, video_ref, start_seconds, end_seconds, title, original_artist, position, version_note) VALUES
  ('00000000-0000-4000-8000-00000000b01c', '00000000-0000-4000-8000-00000000a001', 1100, 1200, 'zzS17歌', 'zz歌手辛', 11, '清唱');

-- S17
DO $$
DECLARE cat jsonb; k_song bigint; k_code text; j_song bigint; vrow jsonb; srow jsonb; dict jsonb; d jsonb; found boolean := false;
BEGIN
  k_song := pg_temp.song_of('00000000-0000-4000-8000-00000000b01c');
  j_song := pg_temp.song_of('00000000-0000-4000-8000-00000000b01b');
  SELECT code INTO k_code FROM public.song_segments WHERE id = '00000000-0000-4000-8000-00000000b01c';
  cat := public.get_song_catalog()::jsonb;

  -- 尾端是歌曲字典 {"songs": [[id, title, artist], ...]}，且只有一個元素帶 songs
  dict := cat->(jsonb_array_length(cat) - 1);
  IF dict IS NULL OR NOT (dict ? 'songs') THEN
    RAISE EXCEPTION 'S17 失敗：目錄陣列尾端應是 {"songs": [...]}，得 %', left(dict::text, 120);
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(cat) e WHERE e ? 'songs') <> 1 THEN
    RAISE EXCEPTION 'S17 失敗：只能有一個字典元素';
  END IF;

  -- 片段 8 欄：[code, start, end, title, artist, plays, song_id, version_note]
  SELECT e INTO vrow FROM jsonb_array_elements(cat) e WHERE e->>'v' = 'zzTestVid01';
  IF vrow IS NULL THEN RAISE EXCEPTION 'S17 失敗：已發布的測試歌回不在目錄'; END IF;
  SELECT s INTO srow FROM jsonb_array_elements(vrow->'s') s WHERE s->>0 = k_code;
  IF srow IS NULL THEN RAISE EXCEPTION 'S17 失敗：片段 % 不在目錄', k_code; END IF;
  IF jsonb_array_length(srow) <> 8 THEN
    RAISE EXCEPTION 'S17 失敗：片段應有 8 欄，得 %（%）', jsonb_array_length(srow), srow;
  END IF;
  IF (srow->>6)::bigint IS DISTINCT FROM k_song THEN
    RAISE EXCEPTION 'S17 失敗：第 7 欄應為 song_id=%，得 %', k_song, srow->6;
  END IF;
  IF srow->>7 IS DISTINCT FROM '清唱' THEN
    RAISE EXCEPTION 'S17 失敗：第 8 欄應為版本備註「清唱」，得 %', srow->7;
  END IF;

  -- 字典：含有已發布片段的歌（[id,title,artist]），不含只在草稿歌回出現的歌
  FOR d IN SELECT x FROM jsonb_array_elements(dict->'songs') x LOOP
    IF (d->>0)::bigint = k_song THEN
      found := true;
      IF d->>1 IS DISTINCT FROM 'zzS17歌' OR d->>2 IS DISTINCT FROM 'zz歌手辛' THEN
        RAISE EXCEPTION 'S17 失敗：字典項應為 [id, 歌名, 原唱]，得 %', d;
      END IF;
    END IF;
    IF (d->>0)::bigint = j_song THEN
      RAISE EXCEPTION 'S17 失敗：只出現在草稿歌回的歌不可進字典';
    END IF;
  END LOOP;
  IF NOT found THEN RAISE EXCEPTION 'S17 失敗：已發布片段的歌（%）沒進字典', k_song; END IF;
  RAISE NOTICE 'S17 ok';
END $$;

-- ───────────── S18 權限：anon／authenticated 不能讀歌曲表、不能呼叫新函式；service_role 可以 ─────────────
CREATE TEMP TABLE zz_song_calls (call_sql text);
GRANT SELECT ON zz_song_calls TO anon, authenticated, service_role;
INSERT INTO zz_song_calls (call_sql) VALUES
  ($q$SELECT count(*) FROM public.songs$q$),
  ($q$SELECT count(*) FROM public.song_keys$q$),
  ($q$SELECT public.admin_merge_songs(1, 2, false)$q$),
  ($q$SELECT public.admin_split_segment('00000000-0000-4000-8000-00000000ffff')$q$),
  ($q$SELECT public.admin_rename_song(1, 'a', 'b')$q$),
  ($q$SELECT public.admin_match_songs('[]'::jsonb)$q$),
  ($q$SELECT public.admin_search_songs('a', 5)$q$),
  ($q$SELECT public.admin_song_duplicates(5)$q$),
  ($q$SELECT public.admin_get_song(1)$q$),
  ($q$SELECT public.get_song_catalog()$q$),
  ($q$SELECT public._save_song_video(NULL, '{}'::jsonb, '[]'::jsonb)$q$);

-- S18
SET LOCAL ROLE anon;
DO $$
DECLARE q record;
BEGIN
  FOR q IN SELECT call_sql FROM zz_song_calls LOOP
    BEGIN
      EXECUTE q.call_sql;
      RAISE EXCEPTION 'S18 失敗：anon 可以執行 %', q.call_sql;
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
  FOR q IN SELECT call_sql FROM zz_song_calls LOOP
    BEGIN
      EXECUTE q.call_sql;
      RAISE EXCEPTION 'S18 失敗：authenticated 可以執行 %', q.call_sql;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- 預期：permission denied
    END;
  END LOOP;
END $$;
RESET ROLE;

-- service_role：函式要存在且有執行權限；業務錯誤（找不到歌、片段等）不算失敗
SET LOCAL ROLE service_role;
DO $$
DECLARE q record;
BEGIN
  FOR q IN SELECT call_sql FROM zz_song_calls WHERE call_sql LIKE '%public.admin\_%' ESCAPE '\' OR call_sql LIKE '%get_song_catalog%' LOOP
    BEGIN
      EXECUTE q.call_sql;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE EXCEPTION 'S18 失敗：service_role 不能執行 %', q.call_sql;
      WHEN undefined_function THEN
        RAISE EXCEPTION 'S18 失敗：函式不存在 %', q.call_sql;
      WHEN OTHERS THEN
        NULL; -- 業務錯誤（song_not_found 等）
    END;
  END LOOP;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'S18 ok'; END $$;

-- ───────────── S19 版本備註長度 1～30 或 null ─────────────
-- S19
DO $$
BEGIN
  PERFORM pg_temp.expect_err('S19', $q$insert into public.song_segments (video_ref, start_seconds, end_seconds, title, version_note)
    values ('00000000-0000-4000-8000-00000000a001', 5000, 5100, 'zzS19空備註', '')$q$, 'violates check constraint');
  PERFORM pg_temp.expect_err('S19', format($q$insert into public.song_segments (video_ref, start_seconds, end_seconds, title, version_note)
    values ('00000000-0000-4000-8000-00000000a001', 5000, 5100, 'zzS19超長備註', %L)$q$, repeat('字', 31)), 'violates check constraint');
  INSERT INTO public.song_segments (video_ref, start_seconds, end_seconds, title, version_note)
    VALUES ('00000000-0000-4000-8000-00000000a001', 5000, 5100, 'zzS19剛好30字', repeat('字', 30));
  INSERT INTO public.song_segments (video_ref, start_seconds, end_seconds, title, version_note)
    VALUES ('00000000-0000-4000-8000-00000000a001', 5100, 5200, 'zzS19無備註', NULL);
  INSERT INTO public.song_segments (video_ref, start_seconds, end_seconds, title, version_note)
    VALUES ('00000000-0000-4000-8000-00000000a001', 5200, 5300, 'zzS19一字備註', '練');
  RAISE NOTICE 'S19 ok';
END $$;

-- ───────────── S20 FK 擋刪；鍵隨歌 cascade ─────────────
-- S20
DO $$
DECLARE a bigint; o bigint;
BEGIN
  a := pg_temp.song_of('00000000-0000-4000-8000-00000000b001');
  PERFORM pg_temp.expect_err('S20', format('delete from public.songs where id = %s', a), 'violates foreign key constraint');
  IF NOT EXISTS (SELECT 1 FROM public.songs WHERE id = a) THEN
    RAISE EXCEPTION 'S20 失敗：還有片段引用的歌不可被刪除';
  END IF;

  INSERT INTO public.songs (title, original_artist) VALUES ('zzS20孤兒', NULL) RETURNING id INTO o;
  INSERT INTO public.song_keys (title_key, artist_key, song_id) VALUES ('zzs20孤兒', '', o);
  DELETE FROM public.songs WHERE id = o;
  IF EXISTS (SELECT 1 FROM public.song_keys WHERE song_id = o) THEN
    RAISE EXCEPTION 'S20 失敗：刪除歌時它的鍵應一起 cascade 刪除';
  END IF;
  RAISE NOTICE 'S20 ok';
END $$;

-- ───────────── S11b 收尾不變量：經過合併、拆開、改名、刪除後，不留孤兒歌、每段都有歌 ─────────────
-- S11b
DO $$
DECLARE n integer;
BEGIN
  PERFORM pg_temp.flush();
  SELECT count(*) INTO n FROM public.songs s
   WHERE NOT EXISTS (SELECT 1 FROM public.song_segments g WHERE g.song_id = s.id);
  IF n <> 0 THEN RAISE EXCEPTION 'S11b 失敗：一連串操作後有 % 首孤兒歌沒被清掉', n; END IF;
  SELECT count(*) INTO n FROM public.song_segments WHERE song_id IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'S11b 失敗：% 段沒有 song_id', n; END IF;
  RAISE NOTICE 'S11b ok';
END $$;

\echo 'song_library：全部通過'
ROLLBACK;
