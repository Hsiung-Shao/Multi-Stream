-- T12／T13：嵌入統計 RPC 與團體嵌入 RPC 的 fixture 驗證（整段在交易內，最後 rollback，不留資料）
-- 跑法：docker exec -i supabase_db_multi-stream psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A < tests/sql/embed_t12_t13.sql
-- 預期：
--   T12a hits=2 sites=1（同 host 二次只算 1 站、hits 累加）
--   T12b second_site=t；sites=2（第二個 host 新增一站；分兩條 SELECT 查，同一條會共用快照）
--   T12c over_cap=f sites=200（第 201 個 host 不插入）
--   T12d bad_kind=f bad_host=f（參數驗證）
--   T12e anon_exec=ERROR（anon 不能呼叫 RPC）、anon_table=ERROR（anon 讀不到明細）、anon_usage=1（anon 可讀彙總）
--   T13a members=3（本團 1＋子團 1＋合作藝人 1；他團 0；hidden 場次 0；常駐框 0）
--   T13b parent_name=測試公司X（子團回父團名）
--   T13c null=t（不存在的 uuid）
--   T13d order：live 排最前
begin;
set local session_replication_role = replica;
insert into public.vtuber_groups (id,name,kind,parent_id) values
 ('00000000-0000-4000-8000-0000000000e1','測試公司X','agency',null),
 ('00000000-0000-4000-8000-0000000000e2','測試子團Y','agency','00000000-0000-4000-8000-0000000000e1'),
 ('00000000-0000-4000-8000-0000000000e3','測試公司Z','agency',null);
insert into public.vtubers (id,name,nationality,slug,group_id,schedule_indexable) values
 ('00000000-0000-4000-8000-0000000000f1','本團人','TW','te-a','00000000-0000-4000-8000-0000000000e1',true),
 ('00000000-0000-4000-8000-0000000000f2','子團人','TW','te-b','00000000-0000-4000-8000-0000000000e2',true),
 ('00000000-0000-4000-8000-0000000000f3','合作者','TW','te-c',null,true),
 ('00000000-0000-4000-8000-0000000000f4','他團人','TW','te-d','00000000-0000-4000-8000-0000000000e3',true);
insert into public.vtuber_group_links (vtuber_id,group_id,role,since,until) values
 ('00000000-0000-4000-8000-0000000000f3','00000000-0000-4000-8000-0000000000e1','collaborator','2026-01-01',null);
insert into public.streams (id,vtuber_id,channel_id,source,platform,external_id,status,scheduled_start,actual_start,is_schedule_frame,title) values
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000f1',gen_random_uuid(),'yt_waiting_room','youtube','te-s1','scheduled',now()+interval '2 days',null,false,'本團排程'),
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000f2',gen_random_uuid(),'twitch_live','twitch','te-s2','live',now()-interval '10 minutes',now()-interval '10 minutes',false,'子團直播中'),
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000f3',gen_random_uuid(),'yt_waiting_room','youtube','te-s3','scheduled',now()+interval '1 day',null,false,'合作者排程'),
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000f4',gen_random_uuid(),'yt_waiting_room','youtube','te-s4','scheduled',now()+interval '1 day',null,false,'他團排程'),
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000f1',gen_random_uuid(),'yt_waiting_room','youtube','te-s5','hidden',now()+interval '1 day',null,false,'隱藏場次'),
 (gen_random_uuid(),'00000000-0000-4000-8000-0000000000f1',gen_random_uuid(),'yt_waiting_room','youtube','te-s6','scheduled',now()+interval '3 days',null,true,'常駐框');
set local session_replication_role = origin;

-- T12
select 'T12a' as t, public.embed_referrer_seen('person','te-a','blog.example.com') as first, public.embed_referrer_seen('person','TE-A','Blog.Example.com') as again;
select 'T12a' as t, r.hits, (select sites from public.embed_usage where kind='person' and slug='te-a') as sites from public.embed_referrers r where r.kind='person' and r.slug='te-a' and r.host='blog.example.com';
-- 同一條 SELECT 共用快照會看不到函式的寫入，所以分兩條
select 'T12b' as t, public.embed_referrer_seen('person','te-a','notion.site') as second_site;
select 'T12b' as t, sites from public.embed_usage where kind='person' and slug='te-a';
insert into public.embed_referrers (kind,slug,host) select 'person','te-a','h'||i||'.example.org' from generate_series(1,198) i;
update public.embed_usage set sites = 200 where kind='person' and slug='te-a';
select 'T12c' as t, public.embed_referrer_seen('person','te-a','one-too-many.example.org') as over_cap, (select sites from public.embed_usage where kind='person' and slug='te-a') as sites;
select 'T12d' as t, public.embed_referrer_seen('nope','te-a','x.example.org') as bad_kind, public.embed_referrer_seen('person','te-a','javascript:alert(1)') as bad_host;
-- anon 權限：用 savepoint 包住預期會失敗的敘述
savepoint anon_exec;
set local role anon;
do $$ begin
  begin
    perform public.embed_referrer_seen('person','te-a','anon.example.org');
    raise notice 'T12e anon_exec=OK';
  exception when insufficient_privilege then raise notice 'T12e anon_exec=ERROR'; end;
  begin
    perform count(*) from public.embed_referrers;
    raise notice 'T12e anon_table=OK';
  exception when insufficient_privilege then raise notice 'T12e anon_table=ERROR'; end;
end $$;
select 'T12e' as t, count(*) as anon_usage from public.embed_usage where kind='person' and slug='te-a';
reset role;
rollback to savepoint anon_exec;

-- T13
select 'T13a' as t, json_array_length((public.schedule_group_embed('00000000-0000-4000-8000-0000000000e1'))->'items') as members;
select 'T13a' as t, string_agg(i->>'title', ',' order by i->>'title') as titles from json_array_elements((public.schedule_group_embed('00000000-0000-4000-8000-0000000000e1'))->'items') i;
select 'T13b' as t, (public.schedule_group_embed('00000000-0000-4000-8000-0000000000e2'))->'group'->>'parent_name' as parent_name;
select 'T13c' as t, public.schedule_group_embed('00000000-0000-4000-8000-0000000000ff') is null as "null";
select 'T13d' as t, (public.schedule_group_embed('00000000-0000-4000-8000-0000000000e1'))->'items'->0->>'status' as first_status;
rollback;
