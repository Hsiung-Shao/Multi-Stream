-- 個人週表頁內鏈與收錄門檻（SEO 階段 2，決策 2026-11-04 D9～D11）
--
-- 1. refresh_schedule_indexable()：可索引改成「直播中／7 天內有排程」或「近 90 天結束場次 >= 5」。
--    2026-11-04 正式站估算：1957 → 約 1673（場次 <5 且無排程的 284 頁轉 noindex；它們是只有幾場紀錄的清單頁）。
--    sitemap-schedule.xml 與 edge 的 noindex 都讀 schedule_indexable，不用改。
-- 2. schedule_directory()：名錄頁 /vtubers 的資料（頂層團體＋全部可索引成員），一次 JSON，edge 快取 1 小時。
-- 3. schedule_person_related(p_slug)：個人頁兩個內鏈區塊——同公司／同團（含子團、合作藝人）與同時段常開台
--    （近 90 天最常開台的台北小時相同或相鄰 ±1、排除同團），各最多 12／8 人，只回可索引的人。
-- 兩支 RPC 只回公開欄位（slug、name、img_url、last_live_at、團名）且用 security invoker：vtubers／streams／vtuber_groups／
--    vtuber_group_links 都有 anon SELECT policy，不需要 definer（避免 advisors 的 anon_security_definer 警告）。
--
-- 回滾：
--   drop function if exists public.schedule_person_related(text);
--   drop function if exists public.schedule_directory();
--   重新套 20261008135719_schedule_indexable_align.sql 的 refresh_schedule_indexable() 本體，再 select public.refresh_schedule_indexable();

-- ── 1. 收錄門檻 ─────────────────────────────────────────────────────────────
create or replace function public.refresh_schedule_indexable()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    changed integer;
begin
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

comment on column public.vtubers.schedule_indexable is
    '個人週表頁是否可被搜尋引擎索引：直播中／未來 7 天有排程，或近 90 天結束場次 >= 5。由 refresh_schedule_indexable() 更新（排程 Heavy 每圈呼叫）。';

-- ── 2. 名錄 ─────────────────────────────────────────────────────────────────
-- groups：頂層團體（parent_id 為 null、kind 不是 personal）＋它們的子團；people：全部可索引、有 slug 的人。
-- 分組邏輯（子團歸頂層公司底下、沒所屬＝個人勢）由呼叫端做，這裡只給原始資料。
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
            select json_agg(json_build_object('slug', v.slug, 'name', v.name, 'img_url', v.img_url, 'group_id', v.group_id, 'last_live_at', v.last_live_at)
                            order by v.last_live_at desc nulls last, v.name)
            from public.vtubers v
            where v.schedule_indexable and v.slug is not null
        ), '[]'::json)
    );
$$;

-- ── 3. 個人頁相關 ─────────────────────────────────────────────────────────────
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
    v_top uuid;          -- 頂層團體（本人所屬的公司；子團往上一層）
    v_top_name text;
    v_hour integer;      -- 本人近 90 天最常開台的台北小時
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

    -- 頂層團體：本人所屬（personal 不算）；沒有所屬時看仍在合作中的公司（取最近一筆）
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

    -- 同公司／同團：頂層＋子團的正式成員，加上該公司仍在合作中的藝人；最近開台在前，最多 12
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
        )
        select coalesce(json_agg(json_build_object('slug', m.slug, 'name', m.name, 'img_url', m.img_url, 'group', m.group_name)
                                 order by m.last_live_at desc nulls last, m.name), '[]'::json)
        into v_siblings
        from (
            select distinct on (m.id) m.*
            from members m
            join public.vtubers vv on vv.id = m.id
            where m.id <> v_id and vv.schedule_indexable and m.slug is not null
            order by m.id
        ) m;
    else
        v_siblings := '[]'::json;
    end if;

    -- 同時段常開台：先算本人的眾數小時；再找眾數在 ±1 小時內（跨午夜用模 24）的可索引他人，排除同公司，最多 8
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

-- 權限：兩支讀取 RPC 給 anon（前端）與 service_role（edge 用 anon key 也可）；refresh 維持只給 service_role
revoke all on function public.schedule_directory() from public, authenticated;
grant execute on function public.schedule_directory() to anon, authenticated, service_role;
revoke all on function public.schedule_person_related(text) from public;
grant execute on function public.schedule_person_related(text) to anon, authenticated, service_role;
revoke all on function public.refresh_schedule_indexable() from public, anon, authenticated;
grant execute on function public.refresh_schedule_indexable() to service_role;

-- 立即套用新門檻（sitemap 與 robots 跟著變）
select public.refresh_schedule_indexable();
