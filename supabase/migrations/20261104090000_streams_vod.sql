-- 歷史紀錄連到 VOD（2026-11-04 使用者裁定：後端補 VOD 資料；VOD 壞掉退回頻道影片列表）。
--   streams.vod_id：YouTube＝videoId（與 external_id 同）、Twitch＝Helix videos 的 id（external_id 是直播 id，對不到 VOD）。
--   streams.vod_status：unknown（還沒查）／ok（能看）／missing（刪除、私人、未存檔）。
--   schedule_vod_pending：排程每輪拿待查清單（結束 ≥ 10 分鐘、≤ 14 天；查過 6 小時後可再查，直到 ok／missing）。
--   schedule_vod_write：批次寫回。兩支都只給 service_role（schedule-light 以 service_role 呼叫）。
--   schedule_snapshot_source：ended 列多帶 vod_id／vod_status（欄式格式不變，只是 cols 多兩欄）。
-- 回滾：
--   drop function public.schedule_vod_write(jsonb); drop function public.schedule_vod_pending(integer);
--   重新套 20261014001114 的 schedule_snapshot_source；
--   drop index public.streams_vod_pending_idx; alter table public.streams drop column vod_checked_at, drop column vod_status, drop column vod_id;

alter table public.streams
    add column if not exists vod_id text check (vod_id is null or char_length(vod_id) between 1 and 128),
    add column if not exists vod_status text not null default 'unknown' check (vod_status in ('unknown', 'ok', 'missing')),
    add column if not exists vod_checked_at timestamptz;
comment on column public.streams.vod_id is 'VOD 識別：YouTube videoId（同 external_id）；Twitch 為 Helix videos id';
comment on column public.streams.vod_status is 'unknown＝未查／ok＝可看／missing＝已刪除或未存檔（前端退回頻道影片列表）';

create index if not exists streams_vod_pending_idx on public.streams (actual_end)
    where status = 'ended' and vod_status = 'unknown';

-- 待查清單：結束 10 分鐘～14 天內、還是 unknown、沒查過或 6 小時前查過；舊的先查（早結束的 VOD 早就該出現）
create or replace function public.schedule_vod_pending(p_limit integer default 200)
returns table (id uuid, platform text, external_id text, actual_end timestamptz, vod_checked_at timestamptz, broadcaster_id text)
language sql
stable
security definer
set search_path = ''
as $$
    select s.id, s.platform, s.external_id, s.actual_end, s.vod_checked_at,
           case when s.platform = 'twitch' then c.external_id else null end as broadcaster_id
    from public.streams s
    left join public.vtuber_channels c on c.id = s.channel_id
    where s.status = 'ended'
      and s.vod_status = 'unknown'
      and s.actual_end is not null
      and s.actual_end <= now() - interval '10 minutes'
      and s.actual_end >= now() - interval '14 days'
      and s.source in ('yt_waiting_room', 'twitch_live')
      and (s.vod_checked_at is null or s.vod_checked_at <= now() - interval '6 hours')
    order by s.actual_end asc
    limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
revoke all on function public.schedule_vod_pending(integer) from public, anon, authenticated;
grant execute on function public.schedule_vod_pending(integer) to service_role;

-- 批次寫回：p_rows = [{ id, vod_id, vod_status, vod_checked_at }, …]；回寫入列數
create or replace function public.schedule_vod_write(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_n integer;
begin
    update public.streams s
       set vod_id = nullif(r.vod_id, ''),
           vod_status = r.vod_status,
           vod_checked_at = r.vod_checked_at
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(id uuid, vod_id text, vod_status text, vod_checked_at timestamptz)
     where s.id = r.id
       and r.vod_status in ('unknown', 'ok', 'missing');
    get diagnostics v_n = row_count;
    return v_n;
end;
$$;
revoke all on function public.schedule_vod_write(jsonb) from public, anon, authenticated;
grant execute on function public.schedule_vod_write(jsonb) to service_role;

-- snapshot 來源：ended 列多帶 vod_id／vod_status（unknown 以 null 輸出，前端當作「還沒查」）
create or replace function public.schedule_snapshot_source(p_since timestamptz)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_scols constant text := '["id","vtuber_id","platform","external_id","source","status","scheduled_start","actual_start","actual_end","title","category","is_schedule_frame","fetched_at","merged_with","time_tbd","vod_id","vod_status"]';
    v_active text;
    v_ended text;
    v_vtubers text;
    v_groups text;
    v_links text;
begin
    with src as (
        select case when s.status = 'ended' then 2 else 1 end as k, s.*
        from public.streams s
        where (s.status in ('scheduled', 'live') and s.is_schedule_frame = false)
           or (s.status = 'ended' and s.actual_end >= p_since)
    ), cells as (
        select r.k, r.id, r.vtuber_id,
               '[' || public.schedule_jcell(r.id) || ',' || public.schedule_jcell(r.vtuber_id) || ',' ||
               public.schedule_jcell(r.platform) || ',' || public.schedule_jcell(r.external_id) || ',' ||
               public.schedule_jcell(r.source) || ',' || public.schedule_jcell(r.status) || ',' ||
               public.schedule_jcell(r.scheduled_start) || ',' || public.schedule_jcell(r.actual_start) || ',' ||
               public.schedule_jcell(r.actual_end) || ',' || public.schedule_jcell(r.title) || ',' ||
               public.schedule_jcell(r.category) || ',' || public.schedule_jcell(r.is_schedule_frame) || ',' ||
               public.schedule_jcell(case when r.status = 'live' then r.fetched_at end) || ',' ||
               public.schedule_jcell(r.merged_with) || ',' ||
               public.schedule_jcell(case when r.time_tbd then true end) || ',' ||
               public.schedule_jcell(case when r.status = 'ended' and r.vod_status = 'ok' then r.vod_id end) || ',' ||
               public.schedule_jcell(case when r.status = 'ended' and r.vod_status <> 'unknown' then r.vod_status end) || ']' as cell
        from src r
    ), used as (
        select distinct vtuber_id from src
    )
    select (select string_agg(c.cell, ',' order by c.id) from cells c where c.k = 1),
           (select string_agg(c.cell, ',' order by c.id) from cells c where c.k = 2),
           (select string_agg('[' || public.schedule_jcell(v.id) || ',' || public.schedule_jcell(v.name) || ',' ||
                              public.schedule_jcell(v.img_url) || ',' || public.schedule_jcell(v.nationality) || ',' ||
                              public.schedule_jcell(v.group_id) || ',' || public.schedule_jcell(v.youtube_channel_id) || ',' ||
                              public.schedule_jcell(v.twitch_channel_id) || ',' || public.schedule_jcell(v.slug) || ']', ',' order by v.id)
              from public.vtubers v where v.id in (select u.vtuber_id from used u)),
           (select string_agg('[' || public.schedule_jcell(l.vtuber_id) || ',' || public.schedule_jcell(l.group_id) || ',' ||
                              public.schedule_jcell(l.since) || ',' || public.schedule_jcell(l.until) || ']', ',' order by l.vtuber_id, l.group_id)
              from public.vtuber_group_links l
              where l.role = 'collaborator' and l.vtuber_id in (select u.vtuber_id from used u))
    into v_active, v_ended, v_vtubers, v_links;

    select string_agg('[' || public.schedule_jcell(g.id) || ',' || public.schedule_jcell(g.name) || ',' ||
                      public.schedule_jcell(g.kind) || ',' || public.schedule_jcell(g.parent_id) || ']', ',' order by g.id)
    into v_groups
    from public.vtuber_groups g;

    return ('{"active":{"cols":' || v_scols || ',"rows":[' || coalesce(v_active, '') || ']}' ||
            ',"ended":{"cols":' || v_scols || ',"rows":[' || coalesce(v_ended, '') || ']}' ||
            ',"vtubers":{"cols":["id","name","img_url","nationality","group_id","youtube_channel_id","twitch_channel_id","slug"],"rows":[' || coalesce(v_vtubers, '') || ']}' ||
            ',"groups":{"cols":["id","name","kind","parent_id"],"rows":[' || coalesce(v_groups, '') || ']}' ||
            ',"links":{"cols":["vtuber_id","group_id","since","until"],"rows":[' || coalesce(v_links, '') || ']}}')::json;
end;
$$;
