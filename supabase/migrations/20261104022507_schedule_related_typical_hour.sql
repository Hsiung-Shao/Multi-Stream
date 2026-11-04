-- 階段 2 review 修正（2026-11-04）：
--   1. 「同時段常開台」的眾數小時改成預先算好存在 vtubers.typical_hour（refresh_schedule_indexable 每圈順便更新），
--      RPC 只讀欄位。實測原本每次呼叫都對近 90 天全部場次做 mode()，約 139 ms、40k 個 buffer 讀取，
--      而個人頁 edge 每 slug 每 300 秒、前端每次開頁都會打。
--   2. 同時段區塊排除同公司／同團清單裡的人（含合作藝人），同一人不再同時出現在兩區。
--   3. mode() 平手時 Postgres 取排序後最小的小時（例如 0 時與 23 時各半取 0），結果固定、可接受。
-- 回滾：alter table public.vtubers drop column typical_hour; 重新套 20261104020552 的 schedule_person_related 與
--       20261104020357 的 refresh_schedule_indexable。

alter table public.vtubers add column if not exists typical_hour smallint;
comment on column public.vtubers.typical_hour is
    '近 90 天結束場次最常開台的台北小時（0–23）；沒有場次為 null。由 refresh_schedule_indexable() 每圈更新，給個人頁「同時段常開台」用。';

create or replace function public.refresh_schedule_indexable()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    changed integer;
begin
    -- 常開台小時（和可索引同一圈算，避免另開排程）
    with hours as (
        select s.vtuber_id,
               mode() within group (order by extract(hour from s.actual_start at time zone 'Asia/Taipei')::integer) as h
        from public.streams s
        where not s.is_schedule_frame
          and s.merged_with is null
          and s.status = 'ended'
          and s.actual_start is not null
          and s.actual_end >= now() - interval '90 days'
        group by s.vtuber_id
    )
    update public.vtubers v
    set typical_hour = h.h
    from public.vtubers v2
    left join hours h on h.vtuber_id = v2.id
    where v2.id = v.id
      and v.typical_hour is distinct from h.h;

    with ended as (
        select vtuber_id, count(*) as n
        from public.streams
        where not is_schedule_frame
          and merged_with is null
          and status = 'ended'
          and actual_end >= now() - interval '90 days'
        group by vtuber_id
    ),
    active as (
        select distinct vtuber_id
        from public.streams
        where not is_schedule_frame
          and merged_with is null
          and (
              status = 'live'
              or (status = 'scheduled'
                  and scheduled_start >= now() - interval '15 minutes'
                  and scheduled_start <= now() + interval '7 days')
          )
    ),
    ok as (
        select v2.id
        from public.vtubers v2
        left join active a on a.vtuber_id = v2.id
        left join ended e on e.vtuber_id = v2.id
        where a.vtuber_id is not null or coalesce(e.n, 0) >= 5
    )
    update public.vtubers v
    set schedule_indexable = (o.id is not null)
    from public.vtubers v2
    left join ok o on o.id = v2.id
    where v2.id = v.id
      and v.schedule_indexable is distinct from (o.id is not null);
    get diagnostics changed = row_count;
    return changed;
end;
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
    v_hour smallint;
    v_sibling_ids uuid[] := '{}';
    v_siblings json := '[]'::json;
    v_neighbors json := '[]'::json;
begin
    select v.id, v.group_id, v.typical_hour into v_id, v_group, v_hour
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
        ),
        top12 as (
            select * from picked
            order by last_live_at desc nulls last, name
            limit 12
        )
        select coalesce(json_agg(json_build_object('slug', t.slug, 'name', t.name, 'img_url', t.img_url, 'group', t.group_name)
                                 order by t.last_live_at desc nulls last, t.name), '[]'::json),
               coalesce(array_agg(t.id), '{}')
        into v_siblings, v_sibling_ids
        from top12 t;
    end if;

    if v_hour is not null then
        with fam as (
            select g.id from public.vtuber_groups g where v_top is not null and (g.id = v_top or g.parent_id = v_top)
        )
        select coalesce(json_agg(json_build_object('slug', v.slug, 'name', v.name, 'img_url', v.img_url, 'last_live_at', v.last_live_at)
                                 order by v.last_live_at desc nulls last, v.name), '[]'::json)
        into v_neighbors
        from (
            select v.*
            from public.vtubers v
            where v.schedule_indexable
              and v.id <> v_id
              and v.slug is not null
              and v.typical_hour is not null
              and least(abs(v.typical_hour - v_hour), 24 - abs(v.typical_hour - v_hour)) <= 1
              and (v.group_id is null or v.group_id not in (select id from fam))
              and v.id <> all (v_sibling_ids)
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

-- 立刻算好 typical_hour
select public.refresh_schedule_indexable();
