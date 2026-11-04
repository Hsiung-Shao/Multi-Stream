-- M1～M4：收錄門檻、名錄 RPC、個人頁相關 RPC 的 fixture 驗證（整段在交易內，最後 rollback，不留資料）
-- 跑法：docker exec -i supabase_db_multi-stream psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A < tests/sql/schedule_related_m1_m4.sql
-- 預期：M1 f/t/t/t；M2 people_hit=3 quiet_hit=0 groups_hit=2 y_parent=…00a；M3 siblings=tp-collab,tp-same,tp-sub,tp-z21；M4 neighbors=tp-n20,tp-n21,tp-n22（合作者 tp-collab 22 時在 ±1 內但已在同團清單，不重複）；M3b n=4；null=t
-- 場次時間以 now() 為基準往回推，不會因日期過期失效
begin;
set local session_replication_role = replica;
-- 團體：公司 X、子團 Y(parent X)、公司 Z
insert into public.vtuber_groups (id,name,kind,parent_id) values
 ('00000000-0000-4000-8000-00000000000a','測試公司X','agency',null),
 ('00000000-0000-4000-8000-00000000000b','測試子團Y','agency','00000000-0000-4000-8000-00000000000a'),
 ('00000000-0000-4000-8000-00000000000c','測試公司Z','agency',null);
-- 人：p1 本人(X，21 時)、p2 子團Y、p3 公司X、p4 合作X、p5 不可索引(X)、p6..p9 無所屬 20/21/22/23 時、p10 公司Z 21 時
insert into public.vtubers (id,name,nationality,slug,group_id,schedule_indexable,last_live_at) values
 ('00000000-0000-4000-8000-000000000001','本人','TW','tp-self','00000000-0000-4000-8000-00000000000a',true,now()),
 ('00000000-0000-4000-8000-000000000002','子團人','TW','tp-sub','00000000-0000-4000-8000-00000000000b',true,now()-interval '1 day'),
 ('00000000-0000-4000-8000-000000000003','同公司','TW','tp-same','00000000-0000-4000-8000-00000000000a',true,now()-interval '2 day'),
 ('00000000-0000-4000-8000-000000000004','合作者','TW','tp-collab',null,true,now()-interval '3 day'),
 ('00000000-0000-4000-8000-000000000005','沉默者','TW','tp-quiet','00000000-0000-4000-8000-00000000000a',false,null),
 ('00000000-0000-4000-8000-000000000006','鄰20','TW','tp-n20',null,true,now()),
 ('00000000-0000-4000-8000-000000000007','鄰21','TW','tp-n21',null,true,now()),
 ('00000000-0000-4000-8000-000000000008','鄰22','TW','tp-n22',null,true,now()),
 ('00000000-0000-4000-8000-000000000009','鄰23','TW','tp-n23',null,true,now()),
 ('00000000-0000-4000-8000-000000000010','同公司21','TW','tp-z21','00000000-0000-4000-8000-00000000000a',true,now());
insert into public.vtuber_group_links (vtuber_id,group_id,role,since,until) values
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-00000000000a','collaborator','2026-01-01',null);
-- 場次：台北時間 h 時＝UTC h-8
insert into public.streams (id,vtuber_id,channel_id,source,platform,external_id,status,actual_start,actual_end,is_schedule_frame)
select gen_random_uuid(), v.id, gen_random_uuid(), 'yt_waiting_room', 'youtube', 'x'||v.id||i, 'ended',
       ((date_trunc('day', now() at time zone 'Asia/Taipei') - (i||' days')::interval + (v.h||' hours')::interval) at time zone 'Asia/Taipei'),
       ((date_trunc('day', now() at time zone 'Asia/Taipei') - (i||' days')::interval + ((v.h+2)||' hours')::interval) at time zone 'Asia/Taipei'), false
from (values
 ('00000000-0000-4000-8000-000000000001'::uuid,21),('00000000-0000-4000-8000-000000000006'::uuid,20),
 ('00000000-0000-4000-8000-000000000007'::uuid,21),('00000000-0000-4000-8000-000000000008'::uuid,22),
 ('00000000-0000-4000-8000-000000000009'::uuid,23),('00000000-0000-4000-8000-000000000010'::uuid,21),
 ('00000000-0000-4000-8000-000000000002'::uuid,10),('00000000-0000-4000-8000-000000000003'::uuid,11),('00000000-0000-4000-8000-000000000004'::uuid,22)) v(id,h),
 generate_series(1,5) i;
-- M1：4 場無排程 / 5 場 / 1 場＋排程 / 0 場直播中
insert into public.vtubers (id,name,nationality,slug,schedule_indexable) values
 ('00000000-0000-4000-8000-000000000021','四場','TW','tp-m1a',true),
 ('00000000-0000-4000-8000-000000000022','五場','TW','tp-m1b',false),
 ('00000000-0000-4000-8000-000000000023','一場有排程','TW','tp-m1c',false),
 ('00000000-0000-4000-8000-000000000024','直播中','TW','tp-m1d',false);
insert into public.streams (id,vtuber_id,channel_id,source,platform,external_id,status,actual_start,actual_end,is_schedule_frame)
select gen_random_uuid(), '00000000-0000-4000-8000-000000000021'::uuid, gen_random_uuid(),'yt_waiting_room','youtube','m1a'||i,'ended',now()-(i||' days')::interval,now()-(i||' days')::interval+interval '1 hour',false from generate_series(1,4) i
union all select gen_random_uuid(), '00000000-0000-4000-8000-000000000022'::uuid, gen_random_uuid(),'yt_waiting_room','youtube','m1b'||i,'ended',now()-(i||' days')::interval,now()-(i||' days')::interval+interval '1 hour',false from generate_series(1,5) i
union all select gen_random_uuid(), '00000000-0000-4000-8000-000000000023'::uuid, gen_random_uuid(),'yt_waiting_room','youtube','m1c1','ended',now()-interval '1 day',now()-interval '23 hours',false;
insert into public.streams (id,vtuber_id,channel_id,source,platform,external_id,status,scheduled_start,is_schedule_frame) values
 (gen_random_uuid(),'00000000-0000-4000-8000-000000000023',gen_random_uuid(),'yt_waiting_room','youtube','m1c2','scheduled',now()+interval '2 days',false),
 (gen_random_uuid(),'00000000-0000-4000-8000-000000000024',gen_random_uuid(),'yt_waiting_room','twitch','m1d1','live',null,false);
select public.refresh_schedule_indexable() as changed;
select 'M1' as t, slug, schedule_indexable from public.vtubers where slug like 'tp-m1%' order by slug;
select 'M2' as t,
  (select count(*) from json_array_elements((public.schedule_directory())->'people') p where p->>'slug' in ('tp-self','tp-sub','tp-collab')) as people_hit,
  (select count(*) from json_array_elements((public.schedule_directory())->'people') p where p->>'slug'='tp-quiet') as quiet_hit,
  (select count(*) from json_array_elements((public.schedule_directory())->'groups') g where g->>'name' in ('測試公司X','測試子團Y') ) as groups_hit,
  (select g->>'parent_id' from json_array_elements((public.schedule_directory())->'groups') g where g->>'name'='測試子團Y') as y_parent;
select 'M3' as t, r->'agency'->>'name' as agency,
  (select string_agg(s->>'slug', ',' order by s->>'slug') from json_array_elements(r->'siblings') s) as siblings
from public.schedule_person_related('tp-self') r;
select 'M4' as t, (select string_agg(n->>'slug', ',' order by n->>'slug') from json_array_elements(r->'neighbors') n) as neighbors
from public.schedule_person_related('tp-self') r;
select 'M3b 合作者視角' as t, r->'agency'->>'name' as agency, (select count(*) from json_array_elements(r->'siblings')) as n from public.schedule_person_related('tp-collab') r;
select 'null' as t, public.schedule_person_related('no-such-slug') is null as is_null;
rollback;
