-- review 修正（2026-11-04）：
--   ① vod_status 加終態 'expired'：結束超過 14 天仍 unknown 的場次不再查，並離開部分索引 streams_vod_pending_idx
--      （否則 migration 前的所有歷史 ended 列會永遠留在索引裡）。前端與 snapshot 只認 ok／missing，expired 對外同 unknown。
--   ② schedule_vod_expire()：service_role 每輪呼叫，把超過 14 天的 unknown 改成 expired；本檔最後先跑一次處理歷史資料。
--   ③ schedule_vod_pending：ok 不再是終態——結束後 24 小時與 7 天各重查一次（VTuber 事後把存檔設私人／刪除、Twitch VOD 到期），
--      條件：ok 且 vod_checked_at 早於該檢查點、且現在已過檢查點。
--   ④ schedule_vod_write 接受 'expired'。
--   ⑤ schedule_snapshot_check 指紋加 vod_status／vod_id：VOD 寫回後 snapshot 會重建，不必等 60 分鐘強制重建。
-- 回滾：drop function public.schedule_vod_expire(); 重新套 20261104151921 的 schedule_vod_pending／schedule_vod_write
--       與 20261014001114 的 schedule_snapshot_check；把 check 改回三值前先 update expired → unknown。

alter table public.streams drop constraint if exists streams_vod_status_check;
alter table public.streams add constraint streams_vod_status_check check (vod_status in ('unknown', 'ok', 'missing', 'expired'));

create or replace function public.schedule_vod_expire()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_n integer;
begin
    update public.streams s
       set vod_status = 'expired'
     where s.status = 'ended'
       and s.vod_status = 'unknown'
       and (s.actual_end is null or s.actual_end < now() - interval '14 days');
    get diagnostics v_n = row_count;
    return v_n;
end;
$$;
revoke all on function public.schedule_vod_expire() from public, anon, authenticated;
grant execute on function public.schedule_vod_expire() to service_role;

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
      and s.actual_end is not null
      and s.source in ('yt_waiting_room', 'twitch_live')
      and (
            -- 還沒查到：結束 10 分鐘～14 天內，沒查過或 6 小時前查過
            (s.vod_status = 'unknown'
             and s.actual_end <= now() - interval '10 minutes'
             and s.actual_end >= now() - interval '14 days'
             and (s.vod_checked_at is null or s.vod_checked_at <= now() - interval '6 hours'))
            -- 已查到 ok：結束後 24 小時、7 天各再確認一次（存檔被刪、Twitch VOD 到期）
         or (s.vod_status = 'ok'
             and s.actual_end >= now() - interval '14 days'
             and (
                   (now() >= s.actual_end + interval '24 hours' and s.vod_checked_at < s.actual_end + interval '24 hours')
                or (now() >= s.actual_end + interval '7 days' and s.vod_checked_at < s.actual_end + interval '7 days')
             ))
      )
    order by s.actual_end asc
    limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
revoke all on function public.schedule_vod_pending(integer) from public, anon, authenticated;
grant execute on function public.schedule_vod_pending(integer) to service_role;

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
       and r.vod_status in ('unknown', 'ok', 'missing', 'expired');
    get diagnostics v_n = row_count;
    return v_n;
end;
$$;
revoke all on function public.schedule_vod_write(jsonb) from public, anon, authenticated;
grant execute on function public.schedule_vod_write(jsonb) to service_role;

create or replace function public.schedule_snapshot_check(p_now timestamptz, p_since timestamptz, p_force_minutes integer)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_q timestamptz := to_timestamp(floor(extract(epoch from p_now) / 1800) * 1800);
    v_today date := (p_now at time zone 'Asia/Taipei')::date;
    v_fp text;
    v_prev text;
    v_at timestamptz;
    v_changed boolean;
begin
    with st as (
        select s.id, s.vtuber_id, s.platform, s.external_id, s.source, s.status,
               s.scheduled_start, s.actual_start, s.actual_end, s.title, s.category,
               s.is_schedule_frame, s.merged_with, s.time_tbd,
               case when s.status = 'ended' and s.vod_status in ('ok', 'missing') then s.vod_status end as vod_status,
               case when s.status = 'ended' and s.vod_status = 'ok' then s.vod_id end as vod_id,
               case when s.status = 'live' then v_q - s.fetched_at > interval '2 hours' end as live_stale,
               case when s.status = 'scheduled' then
                   s.scheduled_start is not null
                   and s.scheduled_start <= v_q + interval '7 days'
                   and case when s.time_tbd then s.scheduled_start + interval '24 hours' > v_q
                            else s.scheduled_start >= v_q - interval '3 hours' end
               end as upcoming,
               case when s.status = 'ended' then
                   s.actual_end is not null
                   and v_q - s.actual_end <= interval '12 hours'
                   and s.actual_end <= v_q + interval '1 hour'
               end as recent
        from public.streams s
        where (s.status in ('scheduled', 'live') and not s.is_schedule_frame)
           or (s.status = 'ended' and s.actual_end >= v_q - interval '12 hours')
    )
    select md5(
        coalesce((select json_agg(json_build_array(
                     id, vtuber_id, platform, external_id, source, status, scheduled_start, actual_start, actual_end,
                     title, category, is_schedule_frame, merged_with, live_stale, upcoming, recent, time_tbd, vod_status, vod_id) order by id)::text
                  from st), '') || '|' ||
        coalesce((select json_agg(json_build_array(
                     v.id, v.name, v.img_url, v.nationality, v.group_id, v.youtube_channel_id, v.twitch_channel_id, v.slug)
                     order by v.id)::text
                  from public.vtubers v where v.id in (select vtuber_id from st)), '') || '|' ||
        coalesce((select json_agg(json_build_array(g.id, g.name, g.kind, g.parent_id) order by g.id)::text
                  from public.vtuber_groups g), '') || '|' ||
        coalesce((select json_agg(json_build_array(l.vtuber_id, l.group_id) order by l.vtuber_id, l.group_id)::text
                  from public.vtuber_group_links l
                  where l.role = 'collaborator'
                    and (l.since is null or l.since <= v_today)
                    and (l.until is null or l.until >= v_today)), '') || '|' ||
        coalesce((select c.last_run_at::text from public.cron_shard_state c where c.job_name = 'schedule_heavy_rss'), '')
    )
    into v_fp;

    select c.last_run_stats->>'fingerprint',
           coalesce((c.last_run_stats->>'checked_at')::timestamptz, c.last_run_at)
      into v_prev, v_at
    from public.cron_shard_state c where c.job_name = 'snapshot';

    v_changed := v_prev is null
        or v_prev <> v_fp
        or v_at is null
        or p_now - v_at >= make_interval(mins => p_force_minutes);
    return json_build_object(
        'changed', v_changed,
        'fingerprint', v_fp || '@' || (floor(extract(epoch from p_now) * 1000))::bigint
    );
end;
$$;

-- 歷史資料一次收斂（之後由排程每輪維護）
select public.schedule_vod_expire();
