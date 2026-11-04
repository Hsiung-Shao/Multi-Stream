-- review 第 1 輪修正（2026-11-04）：
--   ① embed_referrer_seen：改用 insert 的結果（xmax = 0）判斷是不是新站。原本先 not exists 再 insert，兩個 colo 同時第一次看到
--      同一宿主站時都判斷為新 → embed_usage.sites 多算（明細只有 1 筆、sites 卻 2）。200 站上限的檢查仍是先 count，競態只會多出極少數。
--   ② schedule_group_embed：時間窗改成與 edge／個人頁同一套規則（live 不設下限；scheduled 一般 15 分鐘寬限、時間未定當天內；上限 7 天），
--      原本 now()-1 day 會讓過期但仍 scheduled 的場次先佔名額、開播超過 24 小時的直播漏掉；limit 50→100 並回傳 total，edge 可寫「還有 N 場」。
-- 回滾：重新套用 20261104070027 與 20261104070032 的函式定義。

create or replace function public.embed_referrer_seen(p_kind text, p_slug text, p_host text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_slug text := lower(p_slug);
    v_host text := lower(p_host);
    v_sites integer;
    v_new boolean;
begin
    if p_kind is null or p_kind not in ('person', 'group') then return false; end if;
    if v_slug is null or char_length(v_slug) not between 1 and 64 then return false; end if;
    if v_host is null or char_length(v_host) not between 1 and 253 or v_host !~ '^[a-z0-9.-]+$' then return false; end if;

    if not exists (select 1 from public.embed_referrers r where r.kind = p_kind and r.slug = v_slug and r.host = v_host) then
        select count(*) into v_sites from public.embed_referrers r where r.kind = p_kind and r.slug = v_slug;
        if v_sites >= 200 then return false; end if;
    end if;

    -- xmax = 0 只在真的 insert 時成立；走到 on conflict update 的列 xmax 不為 0
    insert into public.embed_referrers (kind, slug, host) values (p_kind, v_slug, v_host)
    on conflict (kind, slug, host) do update set last_seen = now(), hits = public.embed_referrers.hits + 1
    returning (xmax = 0) into v_new;

    insert into public.embed_usage (kind, slug, sites, last_seen) values (p_kind, v_slug, 1, now())
    on conflict (kind, slug) do update set sites = public.embed_usage.sites + (case when v_new then 1 else 0 end), last_seen = now();
    return true;
end;
$$;
revoke all on function public.embed_referrer_seen(text, text, text) from public, anon, authenticated;
grant execute on function public.embed_referrer_seen(text, text, text) to service_role;

create or replace function public.schedule_group_embed(p_group_id uuid)
returns json
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_name text;
    v_parent text;
    v_items json;
    v_total integer;
begin
    select g.name, pg.name into v_name, v_parent
    from public.vtuber_groups g
    left join public.vtuber_groups pg on pg.id = g.parent_id
    where g.id = p_group_id and g.kind is distinct from 'personal';
    if v_name is null then
        return null;
    end if;

    with fam as (
        select g.id from public.vtuber_groups g where g.id = p_group_id or g.parent_id = p_group_id
    ),
    members as (
        select v.id, v.name, v.slug, v.img_url
        from public.vtubers v
        where v.group_id in (select id from fam)
        union
        select v.id, v.name, v.slug, v.img_url
        from public.vtuber_group_links l
        join public.vtubers v on v.id = l.vtuber_id
        where l.group_id in (select id from fam)
          and l.role = 'collaborator'
          and (l.until is null or l.until >= current_date)
    ),
    matched as (
        select s.title, s.platform, s.status, s.scheduled_start, s.actual_start, s.time_tbd,
               m.name as member_name, m.slug as member_slug, m.img_url
        from public.streams s
        join members m on m.id = s.vtuber_id
        where s.is_schedule_frame = false
          and s.merged_with is null
          and (
                s.status = 'live'
             or (s.status = 'scheduled'
                 and s.scheduled_start is not null
                 and s.scheduled_start >= now() - (case when s.time_tbd then interval '1 day' else interval '15 minutes' end)
                 and s.scheduled_start <= now() + interval '7 days')
          )
    ),
    picked as (
        select * from matched
        order by (status = 'live') desc, coalesce(actual_start, scheduled_start) asc nulls last
        limit 100
    )
    select coalesce(json_agg(json_build_object(
        'member_name', p.member_name, 'member_slug', p.member_slug, 'img_url', p.img_url,
        'title', p.title, 'platform', p.platform, 'status', p.status,
        'scheduled_start', p.scheduled_start, 'actual_start', p.actual_start, 'time_tbd', p.time_tbd
    )), '[]'::json), (select count(*) from matched)
    into v_items, v_total
    from picked p;

    return json_build_object(
        'group', json_build_object('id', p_group_id, 'name', v_name, 'parent_name', v_parent),
        'items', v_items,
        'total', v_total
    );
end;
$$;
revoke all on function public.schedule_group_embed(uuid) from public;
grant execute on function public.schedule_group_embed(uuid) to anon, authenticated, service_role;
