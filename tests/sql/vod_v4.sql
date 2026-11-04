-- V4：schedule_vod_pending 的待對帳挑選規則（整段在交易內，最後 rollback，不留資料）
-- 跑法：docker exec -i supabase_db_multi-stream psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A < tests/sql/vod_v4.sql
-- fixture（四筆 ended 場次，vod_status 皆為 unknown，除 s4）：
--   vod-s1 twitch 結束 5 分鐘前（太新，Twitch 還在產生 VOD）→ 不回
--   vod-s2 twitch 結束 2 天前                              → 回（broadcaster_id 取自 vtuber_channels.external_id）
--   vod-s3 youtube 結束 20 天前（太舊，不再追）            → 不回
--   vod-s4 twitch 結束 2 天前但 vod_status='ok'（已對帳）  → 不回
-- 預期：
--   V4a n=1（只有第二筆）
--   V4b external_id=vod-s2 platform=twitch broadcaster_id=bc-9001
--   V4c twitch_null_broadcaster=f（twitch 列一定有 broadcaster_id）
begin;
set local session_replication_role = replica;
insert into public.vtubers (id,name,nationality,slug,schedule_indexable) values
 ('00000000-0000-4000-8000-0000000000a1','VOD測試人','TW','vod-a',true);
insert into public.vtuber_channels (id,vtuber_id,platform,external_id,handle) values
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a1','twitch','bc-9001','vodtester'),
 ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000a1','youtube','UCvodtesterxxxxxxxxxxxxx','UCvodtesterxxxxxxxxxxxxx');
insert into public.streams (id,vtuber_id,channel_id,source,platform,external_id,status,actual_start,actual_end,is_schedule_frame,title,vod_status) values
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b1','twitch_live','twitch','vod-s1','ended',now()-interval '3 hours',now()-interval '5 minutes',false,'太新','unknown'),
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b1','twitch_live','twitch','vod-s2','ended',now()-interval '2 days 3 hours',now()-interval '2 days',false,'該對帳','unknown'),
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','yt_waiting_room','youtube','vod-s3','ended',now()-interval '20 days 3 hours',now()-interval '20 days',false,'太舊','unknown'),
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b1','twitch_live','twitch','vod-s4','ended',now()-interval '2 days 3 hours',now()-interval '2 days',false,'已對帳','ok');
set local session_replication_role = origin;

select 'V4a' as t, count(*) as n from public.schedule_vod_pending(100) p where to_jsonb(p)->>'external_id' like 'vod-s%';
select 'V4b' as t, to_jsonb(p)->>'external_id' as external_id, to_jsonb(p)->>'platform' as platform, to_jsonb(p)->>'broadcaster_id' as broadcaster_id
  from public.schedule_vod_pending(100) p where to_jsonb(p)->>'external_id' like 'vod-s%';
select 'V4c' as t, bool_or(to_jsonb(p)->>'broadcaster_id' is null) as twitch_null_broadcaster
  from public.schedule_vod_pending(100) p where to_jsonb(p)->>'platform' = 'twitch' and to_jsonb(p)->>'external_id' like 'vod-s%';
rollback;
