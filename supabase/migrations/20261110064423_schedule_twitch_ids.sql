-- schedule-light 的 Twitch 直播查詢瘦身（2026-11-10，出口流量第二輪降載）。
-- 原本每 10 分鐘讀全部 Twitch 頻道（schedule_roster_v2，約 1,580 列 × 兩個 uuid ≈ 124KB）；
-- 改成只讀 user id 陣列查 helix，再只對直播中的少數 user id 取回頻道與實況主 id。
-- 回滾：drop function public.schedule_twitch_ids(); drop function public.schedule_twitch_resolve(text[]);

create or replace function public.schedule_twitch_ids()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(array_agg(c.external_id order by c.id), '{}')
    from public.vtuber_channels c
    join public.vtubers v on v.id = c.vtuber_id
    -- 與 schedule_roster_v2 的名冊條件相同（active、有 external_id、非畢業）
    where c.platform = 'twitch' and c.status = 'active' and c.external_id is not null and v.activity <> 'graduate';
$$;

create or replace function public.schedule_twitch_resolve(p_external_ids text[])
returns table (id uuid, vtuber_id uuid, external_id text)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, c.vtuber_id, c.external_id
    from public.vtuber_channels c
    join public.vtubers v on v.id = c.vtuber_id
    where c.platform = 'twitch' and c.status = 'active' and v.activity <> 'graduate'
      and c.external_id = any(p_external_ids);
$$;

revoke all on function public.schedule_twitch_ids() from public, anon, authenticated;
revoke all on function public.schedule_twitch_resolve(text[]) from public, anon, authenticated;
grant execute on function public.schedule_twitch_ids() to service_role;
grant execute on function public.schedule_twitch_resolve(text[]) to service_role;
