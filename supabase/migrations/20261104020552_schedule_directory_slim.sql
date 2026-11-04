-- 名錄與相關 RPC 的實測修正（2026-11-04 套上一支後量到）：
--   1. schedule_directory() 不再回 img_url：1680 人的頭像網址讓回應 470 KB，前端每次開名錄頁都從 Supabase 拉一次（出口流量）；
--      名錄只需要名字與連結，頭像由個人頁自己顯示。估 470 KB → 約 150 KB。
--   2. schedule_person_related() 同公司／同團清單套上限 12（最近開台在前），與規格一致（實測春魚創意回 23 人）。
-- 回滾：重新套 20261104020357 的兩支函式本體（本檔版本號取自 MCP apply_migration 寫入的 schema_migrations）。

create or replace function public.schedule_directory()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
    select json_build_object(
        'groups', coalesce((
            select json_agg(json_build_object('id', g.id, 'name', g.name, 'parent_id', g.parent_id, 'kind', g.kind) order by g.name)
            from public.vtuber_groups g
            where g.kind is distinct from 'personal'
        ), '[]'::json),
        'people', coalesce((
            select json_agg(json_build_object('slug', v.slug, 'name', v.name, 'group_id', v.group_id, 'last_live_at', v.last_live_at)
                            order by v.last_live_at desc nulls last, v.name)
            from public.vtubers v
            where v.schedule_indexable and v.slug is not null
        ), '[]'::json)
    );
$$;

create or replace function public.schedule_person_related(p_slug text)
returns json
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_id uuid;
    v_group uuid;
    v_top uuid;
    v_top_name text;
    v_hour integer;
    v_siblings json;
    v_neighbors json;
begin
    select v.id, v.group_id into v_id, v_group
    from public.vtubers v
    where v.slug = p_slug
    limit 1;
    if v_id is null then
        return null;
    end if;

    select coalesce(g.parent_id, g.id) into v_top
    from public.vtuber_groups g
    where g.id = v_group and g.kind is distinct from 'personal';
    if v_top is null then
        select coalesce(g.parent_id, g.id) into v_top
        from public.vtuber_group_links l
        join public.vtuber_groups g on g.id = l.group_id
        where l.vtuber_id = v_id
          and l.role = 'collaborator'
          and (l.until is null or l.until >= current_date)
        order by l.since desc nulls last
        limit 1;
    end if;
    if v_top is not null then
        select g.name into v_top_name from public.vtuber_groups g where g.id = v_top;
    end if;

    if v_top is not null then
        with fam as (
            select g.id from public.vtuber_groups g where g.id = v_top or g.parent_id = v_top
        ),
        members as (
            select v.id, v.slug, v.name, v.img_url, v.last_live_at, g.name as group_name
            from public.vtubers v
            join public.vtuber_groups g on g.id = v.group_id
            where v.group_id in (select id from fam)
            union
            select v.id, v.slug, v.name, v.img_url, v.last_live_at, g.name
            from public.vtuber_group_links l
            join public.vtubers v on v.id = l.vtuber_id
            join public.vtuber_groups g on g.id = l.group_id
            where l.group_id in (select id from fam)
              and l.role = 'collaborator'
              and (l.until is null or l.until >= current_date)
        ),
        picked as (
            select distinct on (m.id) m.*
            from members m
            join public.vtubers vv on vv.id = m.id
            where m.id <> v_id and vv.schedule_indexable and m.slug is not null
            order by m.id
        )
        select coalesce(json_agg(json_build_object('slug', p.slug, 'name', p.name, 'img_url', p.img_url, 'group', p.group_name)
                                 order by p.last_live_at desc nulls last, p.name), '[]'::json)
        into v_siblings
        from (
            select * from picked
            order by last_live_at desc nulls last, name
            limit 12
        ) p;
    else
        v_siblings := '[]'::json;
    end if;

    select mode() within group (order by extract(hour from s.actual_start at time zone 'Asia/Taipei')::integer)
    into v_hour
    from public.streams s
    where s.vtuber_id = v_id
      and s.status = 'ended'
      and not s.is_schedule_frame
      and s.merged_with is null
      and s.actual_start is not null
      and s.actual_end >= now() - interval '90 days';

    if v_hour is null then
        v_neighbors := '[]'::json;
    else
        with hours as (
            select s.vtuber_id,
                   mode() within group (order by extract(hour from s.actual_start at time zone 'Asia/Taipei')::integer) as h
            from public.streams s
            join public.vtubers v on v.id = s.vtuber_id
            where v.schedule_indexable
              and s.status = 'ended'
              and not s.is_schedule_frame
              and s.merged_with is null
              and s.actual_start is not null
              and s.actual_end >= now() - interval '90 days'
            group by s.vtuber_id
        ),
        fam as (
            select g.id from public.vtuber_groups g where v_top is not null and (g.id = v_top or g.parent_id = v_top)
        )
        select coalesce(json_agg(json_build_object('slug', v.slug, 'name', v.name, 'img_url', v.img_url, 'last_live_at', v.last_live_at)
                                 order by v.last_live_at desc nulls last, v.name), '[]'::json)
        into v_neighbors
        from (
            select v.*
            from hours h
            join public.vtubers v on v.id = h.vtuber_id
            where h.vtuber_id <> v_id
              and v.slug is not null
              and least(abs(h.h - v_hour), 24 - abs(h.h - v_hour)) <= 1
              and (v.group_id is null or v.group_id not in (select id from fam))
            order by v.last_live_at desc nulls last, v.name
            limit 8
        ) v;
    end if;

    return json_build_object(
        'agency', case when v_top is null then null else json_build_object('name', v_top_name) end,
        'siblings', v_siblings,
        'neighbors', v_neighbors
    );
end;
$$;
