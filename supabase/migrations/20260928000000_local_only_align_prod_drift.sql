-- 【本地專用】把「正式站有做、但 schema_migrations 沒有紀錄」的手動變更補到本地，
-- 讓本地 public schema 與正式站一致（2026-09-28 以 information_schema / pg_indexes / pg_constraint 比對）。
--
-- 1. 正式站手動 DROP 了 20260220 建的四張與本專案無關的預約系統表（courses / bookings /
--    booking_closed_dates / booking_time_slots）；20260428065522 只 drop 了 products/orders/gallery。
-- 2. 正式站 vtubers.youtube_channel_id 有手動加的 UNIQUE constraint vtubers_youtube_channel_id_key。
-- 3. 正式站 vtubers.youtube_channel_id 也有手動加的外鍵 vtubers_youtube_channel_id_fkey → youtube_channels(channel_id)
--    → 不在這裡加，移到 20261002120100_local_only_youtube_channel_fk.sql（理由見該檔）。
--
-- 不對齊的部分（刻意）：正式站 cron.job 裡兩支已停用、會打 multistreaming.org 的 HTTP 排程
-- （sync_vtuber_livestreams、snapshot_vtuber_subscribers）本地不建，本地不能打正式網域。
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.booking_closed_dates CASCADE;
DROP TABLE IF EXISTS public.booking_time_slots CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;

ALTER TABLE public.vtubers
  ADD CONSTRAINT vtubers_youtube_channel_id_key UNIQUE (youtube_channel_id);
