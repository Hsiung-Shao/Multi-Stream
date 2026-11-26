-- D4：歌曲整理（拆開／合併）後被社群改名，孤兒歌 GC 不可抹掉管理員整理的結果（整段在交易內，最後 rollback，不留資料）
-- 跑法：docker exec -i supabase_db_multi-stream psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A < tests/sql/song_curation_d4.sql
-- GC 是 deferred constraint trigger（commit 時才跑）；交易內用 set constraints all immediate 讓它每句後立刻執行，再檢查結果。
-- fixture（影片皆 published、community_locked=false；歌名加 D4 前綴避免撞到本機既有資料）：
--   D4a 影片 D4aaaaaaaaa：兩個片段同名「D4測試甲歌」→ 同一首 S1；admin_split_segment 拆出第二片段 → S2（新歌、沒有 song_keys）；
--       社群把第二片段改名 → 它改歸新歌，S2 變孤兒；再 admin_revert_song_edit。
--   D4b 影片 D4bbbbbbbbb：片段 X「D4測試乙歌」、Y「D4測試乙歌別名」→ 兩首各 1 個鍵；admin_merge_songs 合併成一首（2 個鍵）；
--       社群把兩個片段都改名 → 合併歌變孤兒；再還原。
--   D4c 影片 D4ccccccccc：單一片段「D4測試丙歌」（1 個鍵）；社群改名 → 舊歌變孤兒。
-- 預期（修正後）：
--   D4a  restored_to_split_song=t   還原後第二片段 song_id＝拆出的歌 S2（S2 沒被 GC 刪掉）
--   D4b1 alias_keys_kept=t          合併歌的兩個別名鍵在社群改名後仍在，且指向同一首
--   D4b2 restored_same_song=t       還原後兩個片段回到同一首歌
--   D4c  old_song_deleted=t         一般歌（1 個鍵、無片段）照常被刪
--   D4d  split_then_renamed_restored=t  拆開後管理員改名（恰好 1 個鍵）仍受保護，還原回拆出的歌
--   D4e  later_split_kept=t         還原不會蓋掉送出修改之後才做的拆開
-- 修正前（現況）：D4a=f、D4b1=f、D4b2=f、D4c=t
begin;
set constraints all immediate;
create temp table d4 (k text primary key, v text);

-- ───────────── D4a：拆開 → 社群改名 → 還原 ─────────────
insert into public.song_videos (video_id, title, status) values ('D4aaaaaaaaa', 'D4a 測試歌回', 'published');
insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
select id, 0, 100, 'D4測試甲歌', null, 0 from public.song_videos where video_id = 'D4aaaaaaaaa';
insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
select id, 200, 300, 'D4測試甲歌', null, 1 from public.song_videos where video_id = 'D4aaaaaaaaa';
-- 前置確認：兩片段同一首歌，才有「拆開」可言
insert into d4 select 'a_seg2', code from public.song_segments where start_seconds = 200 and video_ref = (select id from public.song_videos where video_id = 'D4aaaaaaaaa');
select 'D4a_pre' as t, count(distinct song_id) = 1 as two_segments_share_song
  from public.song_segments where video_ref = (select id from public.song_videos where video_id = 'D4aaaaaaaaa');
select public.admin_split_segment((select id from public.song_segments where code = (select v from d4 where k = 'a_seg2'))) is not null as split_ok \gset
insert into d4 select 'a_s2', song_id::text from public.song_segments where code = (select v from d4 where k = 'a_seg2');
select 'D4a_pre2' as t, (select v from d4 where k = 'a_s2')::bigint
  <> (select song_id from public.song_segments where start_seconds = 0 and video_ref = (select id from public.song_videos where video_id = 'D4aaaaaaaaa')) as split_made_new_song;

-- 社群修改：第二片段改名
select (public.community_save_song_video(
  'D4aaaaaaaaa',
  (select updated_at from public.song_videos where video_id = 'D4aaaaaaaaa'),
  '{"title":"D4a 測試歌回"}'::jsonb,
  (select jsonb_agg(jsonb_build_object(
      'code', s.code, 'start_seconds', s.start_seconds, 'end_seconds', s.end_seconds,
      'title', case when s.start_seconds = 200 then 'D4改名後甲歌' else s.title end,
      'original_artist', s.original_artist, 'position', s.position) order by s.start_seconds)
     from public.song_segments s where s.video_ref = (select id from public.song_videos where video_id = 'D4aaaaaaaaa')),
  '{"ip_hash":"d4d4d4d4d4d4d4d4d4d4"}'::jsonb))->>'submission_id' as sub_a \gset
select admin_revert_song_edit_result is not null as reverted_a from (select public.admin_revert_song_edit(:'sub_a'::uuid) as admin_revert_song_edit_result) x \gset

select 'D4a' as t,
  coalesce((select song_id from public.song_segments where code = (select v from d4 where k = 'a_seg2'))
           = (select v::bigint from d4 where k = 'a_s2'), false) as restored_to_split_song;

-- ───────────── D4b：合併 → 全部片段被改名 → 還原 ─────────────
insert into public.song_videos (video_id, title, status) values ('D4bbbbbbbbb', 'D4b 測試歌回', 'published');
insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
select id, 0, 100, 'D4測試乙歌', null, 0 from public.song_videos where video_id = 'D4bbbbbbbbb';
insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
select id, 200, 300, 'D4測試乙歌別名', null, 1 from public.song_videos where video_id = 'D4bbbbbbbbb';
insert into d4 select 'b_x', song_id::text from public.song_segments where start_seconds = 0 and video_ref = (select id from public.song_videos where video_id = 'D4bbbbbbbbb');
insert into d4 select 'b_y', song_id::text from public.song_segments where start_seconds = 200 and video_ref = (select id from public.song_videos where video_id = 'D4bbbbbbbbb');
select public.admin_merge_songs((select v::bigint from d4 where k = 'b_y'), (select v::bigint from d4 where k = 'b_x'), true) is not null as merged \gset
select 'D4b_pre' as t,
  (select count(*) from public.song_keys where song_id = (select v::bigint from d4 where k = 'b_x')) = 2 as merged_song_has_two_keys;

select (public.community_save_song_video(
  'D4bbbbbbbbb',
  (select updated_at from public.song_videos where video_id = 'D4bbbbbbbbb'),
  '{"title":"D4b 測試歌回"}'::jsonb,
  (select jsonb_agg(jsonb_build_object(
      'code', s.code, 'start_seconds', s.start_seconds, 'end_seconds', s.end_seconds,
      'title', 'D4改名後乙歌', 'original_artist', s.original_artist, 'position', s.position) order by s.start_seconds)
     from public.song_segments s where s.video_ref = (select id from public.song_videos where video_id = 'D4bbbbbbbbb')),
  '{"ip_hash":"d4d4d4d4d4d4d4d4d4d4"}'::jsonb))->>'submission_id' as sub_b \gset

-- 改名後（還原前）：兩個別名鍵都還在，而且指向同一首
select 'D4b1' as t,
  (select count(*) = 2 and count(distinct song_id) = 1
     from public.song_keys where title_key in (public.song_norm_text('D4測試乙歌'), public.song_norm_text('D4測試乙歌別名'))) as alias_keys_kept;

select admin_revert_song_edit_result is not null as reverted_b from (select public.admin_revert_song_edit(:'sub_b'::uuid) as admin_revert_song_edit_result) x \gset
select 'D4b2' as t,
  (select count(distinct song_id) = 1 and min(song_id) = (select v::bigint from d4 where k = 'b_x')
     from public.song_segments where video_ref = (select id from public.song_videos where video_id = 'D4bbbbbbbbb')) as restored_same_song;

-- ───────────── D4c：一般歌（1 個鍵）無片段時照常刪除 ─────────────
insert into public.song_videos (video_id, title, status) values ('D4ccccccccc', 'D4c 測試歌回', 'published');
insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
select id, 0, 100, 'D4測試丙歌', null, 0 from public.song_videos where video_id = 'D4ccccccccc';
insert into d4 select 'c_old', song_id::text from public.song_segments where video_ref = (select id from public.song_videos where video_id = 'D4ccccccccc');
select (public.community_save_song_video(
  'D4ccccccccc',
  (select updated_at from public.song_videos where video_id = 'D4ccccccccc'),
  '{"title":"D4c 測試歌回"}'::jsonb,
  (select jsonb_agg(jsonb_build_object(
      'code', s.code, 'start_seconds', s.start_seconds, 'end_seconds', s.end_seconds,
      'title', 'D4改名後丙歌', 'original_artist', s.original_artist, 'position', s.position) order by s.start_seconds)
     from public.song_segments s where s.video_ref = (select id from public.song_videos where video_id = 'D4ccccccccc')),
  '{"ip_hash":"d4d4d4d4d4d4d4d4d4d4"}'::jsonb))->>'submission_id' as sub_c \gset
select 'D4c' as t, not exists (select 1 from public.songs where id = (select v::bigint from d4 where k = 'c_old')) as old_song_deleted;

-- ───────────── D4d：拆開 → 管理員改名（拆出的歌變成恰好 1 個鍵）→ 社群改名 → 還原 ─────────────
insert into public.song_videos (video_id, title, status) values ('D4ddddddddd', 'D4d 測試歌回', 'published');
insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
select id, 0, 100, 'D4測試丁歌', null, 0 from public.song_videos where video_id = 'D4ddddddddd';
insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
select id, 200, 300, 'D4測試丁歌', null, 1 from public.song_videos where video_id = 'D4ddddddddd';
insert into d4 select 'd_seg2', code from public.song_segments where start_seconds = 200 and video_ref = (select id from public.song_videos where video_id = 'D4ddddddddd');
select public.admin_split_segment((select id from public.song_segments where code = (select v from d4 where k = 'd_seg2'))) is not null as split_d \gset
insert into d4 select 'd_s2', song_id::text from public.song_segments where code = (select v from d4 where k = 'd_seg2');
select public.admin_rename_song((select v::bigint from d4 where k = 'd_s2'), 'D4丁歌另一版', null) is not null as renamed_d \gset
select (public.community_save_song_video(
  'D4ddddddddd',
  (select updated_at from public.song_videos where video_id = 'D4ddddddddd'),
  '{"title":"D4d 測試歌回"}'::jsonb,
  (select jsonb_agg(jsonb_build_object(
      'code', s.code, 'start_seconds', s.start_seconds, 'end_seconds', s.end_seconds,
      'title', case when s.start_seconds = 200 then 'D4改名後丁歌' else s.title end,
      'original_artist', s.original_artist, 'position', s.position) order by s.start_seconds)
     from public.song_segments s where s.video_ref = (select id from public.song_videos where video_id = 'D4ddddddddd')),
  '{"ip_hash":"d4d4d4d4d4d4d4d4d4d4"}'::jsonb))->>'submission_id' as sub_d \gset
select public.admin_revert_song_edit(:'sub_d'::uuid) is not null as reverted_d \gset
select 'D4d' as t,
  coalesce((select song_id from public.song_segments where code = (select v from d4 where k = 'd_seg2'))
           = (select v::bigint from d4 where k = 'd_s2'), false) as split_then_renamed_restored;

-- ───────────── D4e：社群只改第一片段 → 之後管理員拆開第二片段 → 還原該筆修改不得蓋掉拆開 ─────────────
insert into public.song_videos (video_id, title, status) values ('D4eeeeeeeee', 'D4e 測試歌回', 'published');
insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
select id, 0, 100, 'D4測試戊歌', null, 0 from public.song_videos where video_id = 'D4eeeeeeeee';
insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
select id, 200, 300, 'D4測試戊歌', null, 1 from public.song_videos where video_id = 'D4eeeeeeeee';
insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
select id, 400, 500, 'D4測試戊歌', null, 2 from public.song_videos where video_id = 'D4eeeeeeeee';
insert into d4 select 'e_seg2', code from public.song_segments where start_seconds = 200 and video_ref = (select id from public.song_videos where video_id = 'D4eeeeeeeee');
select (public.community_save_song_video(
  'D4eeeeeeeee',
  (select updated_at from public.song_videos where video_id = 'D4eeeeeeeee'),
  '{"title":"D4e 測試歌回"}'::jsonb,
  (select jsonb_agg(jsonb_build_object(
      'code', s.code, 'start_seconds', s.start_seconds, 'end_seconds', s.end_seconds,
      'title', case when s.start_seconds = 0 then 'D4改名後戊歌' else s.title end,
      'original_artist', s.original_artist, 'position', s.position) order by s.start_seconds)
     from public.song_segments s where s.video_ref = (select id from public.song_videos where video_id = 'D4eeeeeeeee')),
  '{"ip_hash":"d4d4d4d4d4d4d4d4d4d4"}'::jsonb))->>'submission_id' as sub_e \gset
select public.admin_split_segment((select id from public.song_segments where code = (select v from d4 where k = 'e_seg2'))) is not null as split_e \gset
insert into d4 select 'e_s2', song_id::text from public.song_segments where code = (select v from d4 where k = 'e_seg2');
select public.admin_revert_song_edit(:'sub_e'::uuid) is not null as reverted_e \gset
select 'D4e' as t,
  coalesce((select song_id from public.song_segments where code = (select v from d4 where k = 'e_seg2'))
           = (select v::bigint from d4 where k = 'e_s2'), false) as later_split_kept;

rollback;
