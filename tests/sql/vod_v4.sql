-- V4：schedule_vod_pending 的待對帳挑選規則（整段在交易內，最後 rollback，不留資料）
-- 跑法：docker exec -i supabase_db_multi-stream psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A < tests/sql/vod_v4.sql
-- fixture（四筆 ended 場次，vod_status 皆為 unknown，除 s4）：
--   vod-s1 twitch 結束 5 分鐘前（太新，Twitch 還在產生 VOD）→ 不回
--   vod-s2 twitch 結束 2 天前                              → 回（broadcaster_id 取自 vtuber_channels.external_id）
--   vod-s3 youtube 結束 20 天前（太舊，不再追）            → 不回
--   vod-s4 twitch 結束 2 天前但 vod_status='ok'、7 天檢查點時間查過（兩個檢查點都算做過）→ 不回
--   vod-s5 twitch 結束 2 天前 vod_status='ok'、結束後 1 小時查過 → 回（24 小時重查）
--   vod-s6 youtube 結束 8 天前 vod_status='ok'、結束後 2 天查過  → 回（7 天重查）
--   vod-s7 youtube 結束 15 天前 unknown                       → 不回；schedule_vod_expire() 把它改成 expired
-- 預期：
--   V4a n=3（s2、s5、s6）
--   V4d ok_recheck=vod-s5,vod-s6
--   V4e expired_at_least_2=t；V4f expired_s7=expired、expired_s3=expired、kept_s2=unknown
--   V4b external_id=vod-s2 platform=twitch broadcaster_id=bc-9001
--   V4c twitch_null_broadcaster=f（twitch 列一定有 broadcaster_id）
--   V4b 只看 unknown 的那筆（external_id=vod-s2）
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
insert into public.streams (id,vtuber_id,channel_id,source,platform,external_id,status,actual_start,actual_end,is_schedule_frame,title,vod_status,vod_id,vod_checked_at) values
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b1','twitch_live','twitch','vod-s5','ended',now()-interval '2 days 3 hours',now()-interval '2 days',false,'24h 重查','ok','v5',now()-interval '2 days'+interval '1 hour'),
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','yt_waiting_room','youtube','vod-s6','ended',now()-interval '8 days 3 hours',now()-interval '8 days',false,'7d 重查','ok','vod-s6',now()-interval '6 days'),
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','yt_waiting_room','youtube','vod-s7','ended',now()-interval '15 days 3 hours',now()-interval '15 days',false,'該過期','unknown',null,null);
update public.streams set vod_checked_at = now()-interval '2 days'+interval '7 days' where external_id='vod-s4';
set local session_replication_role = origin;

select 'V4a' as t, count(*) as n from public.schedule_vod_pending(100) p where to_jsonb(p)->>'external_id' like 'vod-s%';
select 'V4b' as t, to_jsonb(p)->>'external_id' as external_id, to_jsonb(p)->>'platform' as platform, to_jsonb(p)->>'broadcaster_id' as broadcaster_id
  from public.schedule_vod_pending(100) p where to_jsonb(p)->>'external_id' = 'vod-s2';
select 'V4d' as t, string_agg(to_jsonb(p)->>'external_id', ',' order by to_jsonb(p)->>'external_id') as ok_recheck
  from public.schedule_vod_pending(100) p where to_jsonb(p)->>'external_id' in ('vod-s4','vod-s5','vod-s6');
-- expire 的寫入與同一條 SELECT 的子查詢共用快照看不到（memory error_pg_same_statement_snapshot）：拆兩句
select 'V4e' as t, public.schedule_vod_expire() >= 2 as expired_at_least_2;
select 'V4f' as t,
  (select vod_status from public.streams where external_id='vod-s7') as expired_s7,
  (select vod_status from public.streams where external_id='vod-s3') as expired_s3,
  (select vod_status from public.streams where external_id='vod-s2') as kept_s2;
select 'V4c' as t, bool_or(to_jsonb(p)->>'broadcaster_id' is null) as twitch_null_broadcaster
  from public.schedule_vod_pending(100) p where to_jsonb(p)->>'platform' = 'twitch' and to_jsonb(p)->>'external_id' like 'vod-s%';
rollback;
