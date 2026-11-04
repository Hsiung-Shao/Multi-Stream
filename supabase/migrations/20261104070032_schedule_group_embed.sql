-- 團體嵌入（/embed/schedule/group/<uuid>）：一個團（含子團與合作藝人）的成員直播中＋近期排程。
-- security invoker：vtubers／streams／vtuber_groups／vtuber_group_links 都有 anon select policy（hidden 場次由 RLS 排除）。
-- 成員定義與 schedule_person_related（20261104022507）一致：團＋子團的 group_id 成員 ∪ 有效合作藝人。
-- 時間範圍抓寬（過去 1 天～未來 8 天），精確的「7 天內／15 分鐘寬限／時間未定」由 edge 端 functions/lib/schedule-group-embed.js 決定。
-- 回傳 null＝查無此團（或 kind = personal）；否則 { group: { id, name, parent_name }, items: [...] }，items 最多 50 列。
-- 回滾：drop function public.schedule_group_embed(uuid);

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
    picked as (
        select s.title, s.platform, s.status, s.scheduled_start, s.actual_start, s.time_tbd,
               m.name as member_name, m.slug as member_slug, m.img_url
        from public.streams s
        join members m on m.id = s.vtuber_id
        where s.status in ('live', 'scheduled')
          and s.is_schedule_frame = false
          and s.merged_with is null
          and coalesce(s.actual_start, s.scheduled_start) between now() - interval '1 day' and now() + interval '8 days'
        order by (s.status = 'live') desc, coalesce(s.actual_start, s.scheduled_start) asc
        limit 50
    )
    select coalesce(json_agg(json_build_object(
        'member_name', p.member_name, 'member_slug', p.member_slug, 'img_url', p.img_url,
        'title', p.title, 'platform', p.platform, 'status', p.status,
        'scheduled_start', p.scheduled_start, 'actual_start', p.actual_start, 'time_tbd', p.time_tbd
    )), '[]'::json)
    into v_items
    from picked p;

    return json_build_object(
        'group', json_build_object('id', p_group_id, 'name', v_name, 'parent_name', v_parent),
        'items', v_items
    );
end;
$$;
revoke all on function public.schedule_group_embed(uuid) from public;
grant execute on function public.schedule_group_embed(uuid) to anon, authenticated, service_role;
