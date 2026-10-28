-- 歌曲長度參考：end_estimated 欄位與存檔保留、song_length_refs 快取表、song_ref_lengths／song_length_refs_put 與權限（SQL11～SQL14）。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/song_length_refs.sql
-- 整檔在一個交易內，結尾 ROLLBACK，不留下任何資料。斷言失敗一律 RAISE EXCEPTION。
--
-- 假設（契約沒寫死）：
--   C1 song_ref_lengths 回傳 jsonb（或 json，一律轉 jsonb 比對），陣列與輸入同長同序，每項 {seconds, source}。
--   C2 fetched_at 的「幾天前」在測試中直接寫快取表，不靠 now() 流逝。
--   C3 song_segments 孤兒清除 trigger 是延後執行，整檔 SET CONSTRAINTS ALL DEFERRED。

BEGIN;

SET CONSTRAINTS ALL DEFERRED;

-- ───────────── 測試輔助（pg_temp，ROLLBACK 後消失） ─────────────
-- 一律 plpgsql：本體延後解析，新欄位／新函式尚未存在時整檔仍能載入，失敗點落在各自的斷言。

-- 建影片（直接寫表）
CREATE FUNCTION pg_temp.mkvideo(p_vid text, p_title text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.song_videos (video_id, title, vtuber_id, streamed_at, duration_seconds, status)
  VALUES (p_vid, p_title, '00000000-0000-4000-8000-0000000000f1', '2026-01-01T12:00:00Z', 7200, 'published');
END $$;

-- 建片段（直接寫表）；p_est 對應 end_estimated，p_note 對應 version_note
CREATE FUNCTION pg_temp.mkseg(p_vid text, p_s integer, p_e integer, p_title text, p_artist text, p_est boolean, p_note text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position, end_estimated, version_note)
  SELECT v.id, p_s, p_e, p_title, p_artist, 0, p_est, p_note FROM public.song_videos v WHERE v.video_id = p_vid;
END $$;

-- 呼叫被測函式，轉 jsonb
CREATE FUNCTION pg_temp.lens(p_items jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.song_ref_lengths(p_items)::jsonb;
END $$;

-- 單項查詢，回 {seconds, source}
CREATE FUNCTION pg_temp.len1(p_title text, p_artist text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.lens(jsonb_build_array(jsonb_build_object('title', p_title, 'artist', p_artist)))->0;
END $$;

-- 直接寫快取列（幾天前）
CREATE FUNCTION pg_temp.mkcache(p_title text, p_artist text, p_sec integer, p_days integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.song_length_refs (title_key, artist_key, seconds, matched, country, fetched_at)
  VALUES (public.song_norm_text(p_title), coalesce(public.song_norm_text(p_artist), ''), p_sec, 'zz匹配', 'TW',
          now() - make_interval(days => p_days));
END $$;

-- 斷言一項結果的 source 與 seconds
CREATE FUNCTION pg_temp.expect_item(p_tag text, p_item jsonb, p_source text, p_sec integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_item->>'source' IS DISTINCT FROM p_source THEN
    RAISE EXCEPTION '% 失敗：source 預期「%」，得 %', p_tag, p_source, p_item;
  END IF;
  IF (p_item->>'seconds')::integer IS DISTINCT FROM p_sec THEN
    RAISE EXCEPTION '% 失敗：seconds 預期 %，得 %', p_tag, p_sec, p_item;
  END IF;
END $$;

-- 片段的 end_estimated（依 id）
CREATE FUNCTION pg_temp.est_of(p_id text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE r boolean;
BEGIN
  SELECT end_estimated INTO r FROM public.song_segments WHERE id = p_id::uuid;
  RETURN r;
END $$;

-- 存檔輔助：p_id 為 null 代表新影片；回傳 _save_song_video 的結果（jsonb）
CREATE FUNCTION pg_temp.save(p_id uuid, p_segs jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public._save_song_video(
           p_id,
           jsonb_build_object('video_id', 'zzLenVid003', 'title', 'zz存檔歌回', 'status', 'published',
                              'vtuber_id', '00000000-0000-4000-8000-0000000000f1',
                              'streamed_at', '2026-01-01T12:00:00Z', 'duration_seconds', 7200),
           p_segs)::jsonb;
END $$;

-- 同 save，但可指定影片代號（同一交易內不同測項用不同影片）
CREATE FUNCTION pg_temp.save_as(p_vid text, p_id uuid, p_segs jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public._save_song_video(
           p_id,
           jsonb_build_object('video_id', p_vid, 'title', 'zz存檔歌回', 'status', 'published',
                              'vtuber_id', '00000000-0000-4000-8000-0000000000f1',
                              'streamed_at', '2026-01-01T12:00:00Z', 'duration_seconds', 7200),
           p_segs)::jsonb;
END $$;

-- ───────────── 測資（直接寫表，不依賴本地既有資料） ─────────────
INSERT INTO public.vtubers (id, name, nationality, slug) VALUES
  ('00000000-0000-4000-8000-0000000000f1', 'zz長度參考測試主', 'TW', 'zz-length-refs-test');

-- SQL11：同一首 zzLenSong／zzLenArt 四段（人工確認 200、220；估計 260；有版本備註 240）
SELECT pg_temp.mkvideo('zzLenVid001', 'zz長度歌回');
SELECT pg_temp.mkseg('zzLenVid001',    0,  200, 'zzLenSong', 'zzLenArt', false, NULL);
SELECT pg_temp.mkseg('zzLenVid001',  300,  520, 'zzLenSong', 'zzLenArt', false, NULL);
SELECT pg_temp.mkseg('zzLenVid001',  600,  860, 'zzLenSong', 'zzLenArt', true,  NULL);
SELECT pg_temp.mkseg('zzLenVid001',  900, 1140, 'zzLenSong', 'zzLenArt', false, '清唱');

-- ───────────── SQL11 站內長度取人工確認片段的中位數 ─────────────
-- SQL11
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.lens(jsonb_build_array(jsonb_build_object('title', 'zzLenSong', 'artist', 'zzLenArt')));
  IF jsonb_typeof(r) IS DISTINCT FROM 'array' OR jsonb_array_length(r) <> 1 THEN
    RAISE EXCEPTION 'SQL11 失敗：應回長度 1 的陣列，得 %', r;
  END IF;
  -- 只算 200、220（估計的 260 與有版本備註的 240 都排除）→ 中位數 210
  PERFORM pg_temp.expect_item('SQL11', r->0, 'site', 210);
  RAISE NOTICE 'ok SQL11 站內長度取人工確認片段的中位數';
END $$;

-- ───────────── SQL11b 歌名寫法不同但正規化相同也算同一首 ─────────────
-- SQL11b
DO $$
DECLARE r jsonb;
BEGIN
  -- 全形、大小寫、多空白都不同；順序與長度一併檢查
  r := pg_temp.lens(jsonb_build_array(
         jsonb_build_object('title', 'ＺＺ  LENSONG', 'artist', 'ｚｚ  lenART'),
         jsonb_build_object('title', 'zzLenSong', 'artist', 'zzLenArt')));
  IF jsonb_array_length(r) <> 2 THEN RAISE EXCEPTION 'SQL11b 失敗：輸入 2 項應回 2 項，得 %', r; END IF;
  PERFORM pg_temp.expect_item('SQL11b（寫法不同）', r->0, 'site', 210);
  PERFORM pg_temp.expect_item('SQL11b（原寫法）', r->1, 'site', 210);
  RAISE NOTICE 'ok SQL11b 歌名寫法不同但正規化相同也算同一首';
END $$;

-- ───────────── SQL12 快取過期與查無的判斷 ─────────────
-- SQL12
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.mkcache('zzCacheMissNew', 'zzCacheArt',  NULL, 10);   -- 查無 10 天前：仍有效
  PERFORM pg_temp.mkcache('zzCacheMissOld', 'zzCacheArt',  NULL, 40);   -- 查無 40 天前：過期
  PERFORM pg_temp.mkcache('zzCacheHitNew',  'zzCacheArt',  200,  100);  -- 查到 100 天前：仍有效
  PERFORM pg_temp.mkcache('zzCacheHitOld',  'zzCacheArt',  200,  200);  -- 查到 200 天前：過期

  r := pg_temp.lens(jsonb_build_array(
         jsonb_build_object('title', 'zzCacheMissNew', 'artist', 'zzCacheArt'),
         jsonb_build_object('title', 'zzCacheMissOld', 'artist', 'zzCacheArt'),
         jsonb_build_object('title', 'zzCacheHitNew',  'artist', 'zzCacheArt'),
         jsonb_build_object('title', 'zzCacheHitOld',  'artist', 'zzCacheArt'),
         jsonb_build_object('title', 'zzNoArtistSong', 'artist', NULL)));
  IF jsonb_array_length(r) <> 5 THEN RAISE EXCEPTION 'SQL12 失敗：輸入 5 項應回 5 項，得 %', r; END IF;
  PERFORM pg_temp.expect_item('SQL12 查無 10 天前', r->0, 'miss', NULL);
  PERFORM pg_temp.expect_item('SQL12 查無 40 天前', r->1, 'unknown', NULL);
  PERFORM pg_temp.expect_item('SQL12 查到 100 天前', r->2, 'itunes', 200);
  PERFORM pg_temp.expect_item('SQL12 查到 200 天前', r->3, 'unknown', NULL);
  PERFORM pg_temp.expect_item('SQL12 沒原唱且沒資料', r->4, 'miss', NULL);
  RAISE NOTICE 'ok SQL12 快取過期與查無的判斷';
END $$;

-- ───────────── SQL12b put 寫入快取並以正規化鍵存放，沒原唱的列忽略 ─────────────
-- SQL12b
DO $$
DECLARE r jsonb; row_ record;
BEGIN
  PERFORM public.song_length_refs_put(jsonb_build_array(
    jsonb_build_object('title', 'ＺＺ PutSong', 'artist', 'zz  PutArt', 'seconds', 245, 'matched', 'zz匹配', 'country', 'TW'),
    jsonb_build_object('title', 'zzPutNoArtist', 'artist', NULL, 'seconds', 180, 'matched', 'zz匹配', 'country', 'TW')));

  -- 以不同寫法查，仍命中同一列
  r := pg_temp.len1('zzputsong', 'ZZPUTART');
  PERFORM pg_temp.expect_item('SQL12b 有原唱', r, 'itunes', 245);

  SELECT * INTO row_ FROM public.song_length_refs
   WHERE title_key = public.song_norm_text('zzPutSong') AND artist_key = public.song_norm_text('zzPutArt');
  IF row_.title_key IS NULL THEN RAISE EXCEPTION 'SQL12b 失敗：快取表沒有以正規化鍵存放的列'; END IF;
  IF row_.matched IS DISTINCT FROM 'zz匹配' OR row_.country IS DISTINCT FROM 'TW' THEN
    RAISE EXCEPTION 'SQL12b 失敗：matched／country 沒寫入，得 %／%', row_.matched, row_.country;
  END IF;
  IF row_.fetched_at < now() - interval '1 minute' OR row_.fetched_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'SQL12b 失敗：fetched_at 應為現在，得 %', row_.fetched_at;
  END IF;

  -- 沒原唱的列不寫
  IF EXISTS (SELECT 1 FROM public.song_length_refs WHERE artist_key = '') THEN
    RAISE EXCEPTION 'SQL12b 失敗：沒原唱的列不該寫進快取表';
  END IF;
  IF EXISTS (SELECT 1 FROM public.song_length_refs WHERE title_key = public.song_norm_text('zzPutNoArtist')) THEN
    RAISE EXCEPTION 'SQL12b 失敗：沒原唱那首不該有任何快取列';
  END IF;

  -- 同鍵再 put 是 upsert（覆蓋秒數），不重複建列
  PERFORM public.song_length_refs_put(jsonb_build_array(
    jsonb_build_object('title', 'zzPutSong', 'artist', 'zzPutArt', 'seconds', 250, 'matched', 'zz匹配二', 'country', 'JP')));
  PERFORM pg_temp.expect_item('SQL12b upsert 覆蓋', pg_temp.len1('zzPutSong', 'zzPutArt'), 'itunes', 250);
  IF (SELECT count(*) FROM public.song_length_refs
       WHERE title_key = public.song_norm_text('zzPutSong') AND artist_key = public.song_norm_text('zzPutArt')) <> 1 THEN
    RAISE EXCEPTION 'SQL12b 失敗：同一組鍵只能有一列';
  END IF;
  RAISE NOTICE 'ok SQL12b put 寫入快取並以正規化鍵存放，沒原唱的列忽略';
END $$;

-- ───────────── SQL12c put：查無不蓋掉 180 天內的查到值，查到可蓋掉查無 ─────────────
-- SQL12c
DO $$
BEGIN
  -- 查到 100 天前 → 新的「查無」不可覆蓋
  PERFORM pg_temp.mkcache('zzPutKeep', 'zzPutArt2', 210, 100);
  PERFORM public.song_length_refs_put(jsonb_build_array(
    jsonb_build_object('title', 'zzPutKeep', 'artist', 'zzPutArt2', 'seconds', NULL, 'matched', NULL, 'country', NULL)));
  PERFORM pg_temp.expect_item('SQL12c 查無不蓋查到', pg_temp.len1('zzPutKeep', 'zzPutArt2'), 'itunes', 210);

  -- 查到 200 天前（已過期）→ 查無可以覆蓋
  PERFORM pg_temp.mkcache('zzPutStale', 'zzPutArt2', 210, 200);
  PERFORM public.song_length_refs_put(jsonb_build_array(
    jsonb_build_object('title', 'zzPutStale', 'artist', 'zzPutArt2', 'seconds', NULL, 'matched', NULL, 'country', NULL)));
  PERFORM pg_temp.expect_item('SQL12c 過期的查到可被查無覆蓋', pg_temp.len1('zzPutStale', 'zzPutArt2'), 'miss', NULL);

  -- 查無 → 查到可覆蓋
  PERFORM pg_temp.mkcache('zzPutMiss', 'zzPutArt2', NULL, 5);
  PERFORM public.song_length_refs_put(jsonb_build_array(
    jsonb_build_object('title', 'zzPutMiss', 'artist', 'zzPutArt2', 'seconds', 233, 'matched', 'zz匹配', 'country', 'TW')));
  PERFORM pg_temp.expect_item('SQL12c 查到蓋掉查無', pg_temp.len1('zzPutMiss', 'zzPutArt2'), 'itunes', 233);

  -- 查到 → 查到（新值）仍覆蓋
  PERFORM public.song_length_refs_put(jsonb_build_array(
    jsonb_build_object('title', 'zzPutKeep', 'artist', 'zzPutArt2', 'seconds', 215, 'matched', 'zz匹配', 'country', 'TW')));
  PERFORM pg_temp.expect_item('SQL12c 查到蓋掉查到', pg_temp.len1('zzPutKeep', 'zzPutArt2'), 'itunes', 215);
  RAISE NOTICE 'ok SQL12c put 查無不蓋掉 180 天內的查到值';
END $$;

-- ───────────── SQL13 存檔保留 end_estimated ─────────────
-- SQL13
DO $$
DECLARE
  r jsonb; r2 jsonb; r3 jsonb; r4 jsonb; vref uuid;
  a_id text; b_id text;
BEGIN
  -- 1) 新增：a 不帶 end_estimated、b 帶 true
  r := pg_temp.save(NULL, jsonb_build_array(
         jsonb_build_object('start_seconds', 0,   'end_seconds', 100, 'title', 'zz存檔甲', 'original_artist', 'zz原唱', 'position', 0),
         jsonb_build_object('start_seconds', 100, 'end_seconds', 200, 'title', 'zz存檔乙', 'original_artist', 'zz原唱', 'position', 1,
                            'end_estimated', true)));
  vref := (r->>'id')::uuid;
  SELECT s.id::text INTO a_id FROM public.song_segments s WHERE s.video_ref = vref AND s.title = 'zz存檔甲';
  SELECT s.id::text INTO b_id FROM public.song_segments s WHERE s.video_ref = vref AND s.title = 'zz存檔乙';
  IF pg_temp.est_of(a_id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SQL13 失敗：新增時沒帶 end_estimated 應為 false，得 %', pg_temp.est_of(a_id);
  END IF;
  IF pg_temp.est_of(b_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SQL13 失敗：新增時帶 true 應為 true，得 %', pg_temp.est_of(b_id);
  END IF;

  -- 2) 更新（內容改了但都不帶 end_estimated）→ 保留原值（b 仍為 true、a 仍為 false）
  r2 := pg_temp.save(vref, jsonb_build_array(
          jsonb_build_object('id', a_id, 'start_seconds', 0,   'end_seconds', 110, 'title', 'zz存檔甲', 'original_artist', 'zz原唱', 'position', 0),
          jsonb_build_object('id', b_id, 'start_seconds', 100, 'end_seconds', 210, 'title', 'zz存檔乙', 'original_artist', 'zz原唱', 'position', 1)));
  IF pg_temp.est_of(b_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SQL13 失敗：更新時沒帶 end_estimated 應保留 true，得 %', pg_temp.est_of(b_id);
  END IF;
  IF pg_temp.est_of(a_id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SQL13 失敗：更新時沒帶 end_estimated 應保留 false，得 %', pg_temp.est_of(a_id);
  END IF;
  IF (SELECT end_seconds FROM public.song_segments WHERE id = b_id::uuid) <> 210 THEN
    RAISE EXCEPTION 'SQL13 失敗：前置條件不成立（更新沒有生效）';
  END IF;

  -- 3) 更新時只有 end_estimated 不同（其餘欄位完全相同）：b 帶 false → false；a 帶 true → true
  r3 := pg_temp.save(vref, jsonb_build_array(
          jsonb_build_object('id', a_id, 'start_seconds', 0,   'end_seconds', 110, 'title', 'zz存檔甲', 'original_artist', 'zz原唱', 'position', 0,
                             'end_estimated', true),
          jsonb_build_object('id', b_id, 'start_seconds', 100, 'end_seconds', 210, 'title', 'zz存檔乙', 'original_artist', 'zz原唱', 'position', 1,
                             'end_estimated', false)));
  IF pg_temp.est_of(b_id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SQL13 失敗：更新時帶 false 應寫入 false（只有此欄不同也要寫），得 %', pg_temp.est_of(b_id);
  END IF;
  IF pg_temp.est_of(a_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SQL13 失敗：更新時帶 true 應寫入 true，得 %', pg_temp.est_of(a_id);
  END IF;

  -- 4) 再次更新不帶 key：保留剛寫入的值
  r4 := pg_temp.save(vref, jsonb_build_array(
          jsonb_build_object('id', a_id, 'start_seconds', 0,   'end_seconds', 110, 'title', 'zz存檔甲', 'original_artist', 'zz原唱', 'position', 0),
          jsonb_build_object('id', b_id, 'start_seconds', 100, 'end_seconds', 210, 'title', 'zz存檔乙', 'original_artist', 'zz原唱', 'position', 1)));
  IF pg_temp.est_of(a_id) IS DISTINCT FROM true OR pg_temp.est_of(b_id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SQL13 失敗：不帶 key 應保留（a=true, b=false），得 a=%, b=%', pg_temp.est_of(a_id), pg_temp.est_of(b_id);
  END IF;
  RAISE NOTICE 'ok SQL13 存檔保留 end_estimated';
END $$;

-- ───────────── SQL13b 存檔回傳的片段帶 end_estimated ─────────────
-- SQL13b
DO $$
DECLARE
  r jsonb; r2 jsonb; a jsonb; b jsonb;
BEGIN
  r := pg_temp.save_as('zzLenVid13b', NULL, jsonb_build_array(
         jsonb_build_object('start_seconds', 0,   'end_seconds', 100, 'title', 'zz回傳甲', 'original_artist', 'zz原唱', 'position', 0),
         jsonb_build_object('start_seconds', 100, 'end_seconds', 200, 'title', 'zz回傳乙', 'original_artist', 'zz原唱', 'position', 1,
                            'end_estimated', true)));
  SELECT e INTO a FROM jsonb_array_elements(r->'segments') e WHERE e->>'title' = 'zz回傳甲';
  SELECT e INTO b FROM jsonb_array_elements(r->'segments') e WHERE e->>'title' = 'zz回傳乙';
  IF NOT (a ? 'end_estimated') OR NOT (b ? 'end_estimated') THEN
    RAISE EXCEPTION 'SQL13b 失敗：回傳的片段缺 end_estimated key，得 % ／ %', a, b;
  END IF;
  IF (a->>'end_estimated')::boolean IS DISTINCT FROM false OR (b->>'end_estimated')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SQL13b 失敗：新增回傳 end_estimated 應為 甲=false／乙=true，得 % ／ %', a, b;
  END IF;

  -- 更新（沿用 id、不帶 key）：回傳的是保留後的值
  r2 := pg_temp.save_as('zzLenVid13b', (r->>'id')::uuid, jsonb_build_array(
          jsonb_build_object('id', a->>'id', 'start_seconds', 0,   'end_seconds', 100, 'title', 'zz回傳甲', 'original_artist', 'zz原唱', 'position', 0),
          jsonb_build_object('id', b->>'id', 'start_seconds', 100, 'end_seconds', 200, 'title', 'zz回傳乙', 'original_artist', 'zz原唱', 'position', 1)));
  SELECT e INTO b FROM jsonb_array_elements(r2->'segments') e WHERE e->>'title' = 'zz回傳乙';
  IF (b->>'end_estimated')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SQL13b 失敗：更新後回傳應保留 end_estimated=true，得 %', b;
  END IF;
  RAISE NOTICE 'ok SQL13b 存檔回傳的片段帶 end_estimated';
END $$;

-- ───────────── SQL15 社群修正快照帶 end_estimated，後台還原寫回 ─────────────
-- SQL15
DO $$
DECLARE
  v_vref uuid; v_code text; v_sub uuid; v_seg uuid; v_rev timestamptz;
BEGIN
  PERFORM pg_temp.mkvideo('zzLenVid015', 'zz還原歌回');
  PERFORM pg_temp.mkseg('zzLenVid015', 0, 240, 'zz還原曲', 'zz原唱', true, NULL);
  SELECT v.id, v.updated_at INTO v_vref, v_rev FROM public.song_videos v WHERE v.video_id = 'zzLenVid015';
  SELECT s.id, s.code INTO v_seg, v_code FROM public.song_segments s WHERE s.video_ref = v_vref;

  -- 社群修正：結束改成人工確認的 200（end_estimated=false）
  PERFORM public.community_save_song_video(
    'zzLenVid015', v_rev,
    jsonb_build_object('title', 'zz還原歌回', 'vtuber_id', '00000000-0000-4000-8000-0000000000f1',
                       'streamed_at', '2026-01-01T12:00:00Z', 'duration_seconds', 7200),
    jsonb_build_array(jsonb_build_object('code', v_code, 'start_seconds', 0, 'end_seconds', 200, 'title', 'zz還原曲',
                                         'original_artist', 'zz原唱', 'position', 0, 'end_estimated', false)),
    jsonb_build_object('source_note', 'zz', 'submitter_contact', 'zz@example.com', 'ip_hash', 'zzzzzzzzzzzzzzzz'));
  IF (SELECT end_seconds FROM public.song_segments WHERE id = v_seg) <> 200
     OR pg_temp.est_of(v_seg::text) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SQL15 失敗：前置條件不成立（社群修正應把結束改成 200、end_estimated=false）';
  END IF;

  SELECT id INTO v_sub FROM public.song_submissions WHERE result_video_ref = v_vref AND status = 'applied';
  PERFORM public.admin_revert_song_edit(v_sub);

  IF (SELECT end_seconds FROM public.song_segments WHERE id = v_seg) <> 240 THEN
    RAISE EXCEPTION 'SQL15 失敗：還原後結束秒數應回到 240，得 %', (SELECT end_seconds FROM public.song_segments WHERE id = v_seg);
  END IF;
  IF pg_temp.est_of(v_seg::text) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SQL15 失敗：還原後 end_estimated 應回到 true，得 %', pg_temp.est_of(v_seg::text);
  END IF;
  RAISE NOTICE 'ok SQL15 社群修正快照帶 end_estimated，後台還原寫回';
END $$;

-- ───────────── SQL14 anon 與 authenticated 不能執行新函式也不能讀快取表 ─────────────
-- SQL14
DO $$
DECLARE
  f text; role_ text; priv text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.song_ref_lengths(jsonb)', 'public.song_length_refs_put(jsonb)'] LOOP
    FOREACH role_ IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(role_, f, 'EXECUTE') THEN
        RAISE EXCEPTION 'SQL14 失敗：% 不應能執行 %', role_, f;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'SQL14 失敗：service_role 應能執行 %', f;
    END IF;
  END LOOP;

  FOREACH role_ IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(role_, 'public.song_length_refs', priv) THEN
        RAISE EXCEPTION 'SQL14 失敗：% 不應有 song_length_refs 的 % 權限', role_, priv;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'ok SQL14 anon 與 authenticated 不能執行新函式也不能讀寫快取表';
END $$;

\echo 'song_length_refs：全部通過'
ROLLBACK;
