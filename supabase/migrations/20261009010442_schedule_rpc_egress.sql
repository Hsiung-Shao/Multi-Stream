-- 排程 Edge Functions 出口流量瘦身（2026-10-09：Supabase 免費方案出口流量超量 134%、日誌 112%）。
--
-- 三支排程（schedule-live 每 20 分、schedule-light 每 10 分、schedule-heavy 每小時，一天約 240 輪）原本每輪經 PostgREST
-- 回讀大量資料（名冊＋全部頻道狀態、看過的影片、整份 snapshot 來源），`in.(100 個 uuid)` 長網址也撐大日誌。
-- 改成資料庫端 RPC，只回需要的少量結果：
--   schedule_roster(platform)                 名冊＋頻道狀態一次取回（取代 vtuber_channels＋schedule_channel_state 兩次全表讀）
--   schedule_unseen_video_ids(ids)            只回沒看過的影片 id（取代逐 100 頻道讀 schedule_seen_videos／streams）
--   schedule_upsert_channel_states(rows)      頻道狀態寫入，payload 有的欄位才更新、tier 保留（取代先 GET tier 再分組 upsert）
--   schedule_twitch_reconcile(now, items)     Twitch 週表沒回來的預告整輪一次取消（取代逐頻道 GET＋PATCH）
--   schedule_snapshot_check(now, since, force) snapshot 指紋：資料沒變就不重組、不上傳
--   schedule_snapshot_mark(fingerprint)       上傳成功後記下指紋（cron_shard_state job_name='snapshot'）
--   schedule_snapshot_source(since)           snapshot 來源一次取回（場次、用到的實況主、團體、合作）
--   schedule_merge_check(ended_since)         雙平台合併的輸入指紋：沒變就不讀全部場次
--   schedule_merge_mark(fingerprint)          合併結果穩定（沒有要改的列）時記下指紋（job_name='merge'）
--
-- 全部 security definer＋search_path=''，只有 service_role 可呼叫（anon／authenticated 一律 permission denied）。
-- 指紋的範圍與欄位必須和 supabase/functions/_shared/snapshot.ts buildSnapshot／sweep.ts applyMerges 的實際輸入一致：
-- 改那兩處的欄位、時間窗（rules.ts 的 LIVE_STALE_HOURS、UPCOMING_WINDOW_DAYS、EXPIRE_AFTER_HOURS、RECENT_WINDOW_HOURS）要同步改這裡。

-- ───────────── 名冊 ─────────────
create or replace function public.schedule_roster(p_platform text default null)
returns json
language sql
stable
security definer
set search_path = ''
as $$
    -- json_agg(整列) 輸出緊湊（json_build_object 會在每個 key 後面多出空白，3,900 列就多幾十 KB）
    select coalesce(json_agg(r order by r.id), '[]'::json)
    from (
        select c.id, c.vtuber_id, c.platform, c.external_id, c.display_name,
               s.tier, s.rss_fail_streak, s.last_new_video_at, s.og_checked_at, s.og_miss_streak
        from public.vtuber_channels c
        join public.vtubers v on v.id = c.vtuber_id
        left join public.schedule_channel_state s on s.channel_id = c.id
        where c.status = 'active'
          and c.external_id is not null
          and v.activity <> 'graduate'
          and (p_platform is null or c.platform = p_platform)
    ) r;
$$;

-- ───────────── 沒看過的影片 ─────────────
-- 「看過」＝schedule_seen_videos 有、或 streams 有同 id 的 YouTube 場次（Twitch 的 external_id 不算）
create or replace function public.schedule_unseen_video_ids(p_ids text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(array_agg(distinct x), '{}'::text[])
    from unnest(coalesce(p_ids, '{}'::text[])) as x
    where not exists (select 1 from public.schedule_seen_videos sv where sv.video_id = x)
      and not exists (select 1 from public.streams st where st.platform = 'youtube' and st.external_id = x);
$$;

-- ───────────── 頻道狀態寫入 ─────────────
-- p_rows：[{channel_id, ...}]，只更新 payload 裡有的 key（失敗列沒有 rss_last_ok_at，不能把既有值清掉）。
-- 沒有狀態列的新頻道建立時 tier 預設 2、tier_reason 'first_seen'（payload 有就用 payload 的）。
create or replace function public.schedule_upsert_channel_states(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_bad text;
begin
    if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
        return;
    end if;
    select k into v_bad
    from jsonb_array_elements(p_rows) r, jsonb_object_keys(r) k
    where k not in ('channel_id', 'tier', 'tier_reason', 'tier_updated_at', 'rss_fail_streak', 'rss_last_ok_at',
                    'rss_last_error', 'last_checked_at', 'last_new_video_at', 'og_checked_at', 'og_miss_streak')
    limit 1;
    if v_bad is not null then
        raise exception 'schedule_upsert_channel_states: 不支援的欄位 %', v_bad using errcode = '22023';
    end if;

    -- 1. 新頻道建列（既有列不動）
    insert into public.schedule_channel_state as s
        (channel_id, tier, tier_reason, tier_updated_at, rss_fail_streak, rss_last_ok_at, rss_last_error,
         last_checked_at, last_new_video_at, og_checked_at, og_miss_streak)
    select (r->>'channel_id')::uuid,
           coalesce((r->>'tier')::smallint, 2),
           case when r ? 'tier_reason' then r->>'tier_reason' else 'first_seen' end,
           coalesce((r->>'tier_updated_at')::timestamptz, now()),
           coalesce((r->>'rss_fail_streak')::integer, 0),
           (r->>'rss_last_ok_at')::timestamptz,
           r->>'rss_last_error',
           (r->>'last_checked_at')::timestamptz,
           (r->>'last_new_video_at')::timestamptz,
           (r->>'og_checked_at')::timestamptz,
           coalesce((r->>'og_miss_streak')::smallint, 0)
    from jsonb_array_elements(p_rows) r
    on conflict (channel_id) do nothing;

    -- 2. 只更新 payload 有的欄位（新建的列再寫一次同樣的值，無害）
    update public.schedule_channel_state s set
        tier              = case when r ? 'tier' then coalesce((r->>'tier')::smallint, s.tier) else s.tier end,
        tier_reason       = case when r ? 'tier_reason' then r->>'tier_reason' else s.tier_reason end,
        tier_updated_at   = case when r ? 'tier_updated_at' then coalesce((r->>'tier_updated_at')::timestamptz, s.tier_updated_at) else s.tier_updated_at end,
        rss_fail_streak   = case when r ? 'rss_fail_streak' then coalesce((r->>'rss_fail_streak')::integer, 0) else s.rss_fail_streak end,
        rss_last_ok_at    = case when r ? 'rss_last_ok_at' then (r->>'rss_last_ok_at')::timestamptz else s.rss_last_ok_at end,
        rss_last_error    = case when r ? 'rss_last_error' then r->>'rss_last_error' else s.rss_last_error end,
        last_checked_at   = case when r ? 'last_checked_at' then (r->>'last_checked_at')::timestamptz else s.last_checked_at end,
        last_new_video_at = case when r ? 'last_new_video_at' then (r->>'last_new_video_at')::timestamptz else s.last_new_video_at end,
        og_checked_at     = case when r ? 'og_checked_at' then (r->>'og_checked_at')::timestamptz else s.og_checked_at end,
        og_miss_streak    = case when r ? 'og_miss_streak' then coalesce((r->>'og_miss_streak')::smallint, 0) else s.og_miss_streak end
    from jsonb_array_elements(p_rows) r
    where s.channel_id = (r->>'channel_id')::uuid;
end;
$$;

-- ───────────── Twitch 週表批次 reconcile ─────────────
-- p_items：[{channel_id, keep: [segment id...], covered_until: timestamptz|null}]，只放這輪成功查到週表的頻道。
-- 這些頻道未來（scheduled_start > p_now）、仍是 scheduled、不在 keep 的 twitch_schedule 預告 → canceled；
-- covered_until 有值（翻頁沒走完）時只作用到該時間為止。回傳取消筆數。
create or replace function public.schedule_twitch_reconcile(p_now timestamptz, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_n integer;
begin
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        return 0;
    end if;
    with items as (
        select (i->>'channel_id')::uuid as channel_id,
               coalesce(i->'keep', '[]'::jsonb) as keep,
               (i->>'covered_until')::timestamptz as covered_until
        from jsonb_array_elements(p_items) i
    )
    update public.streams s
    set status = 'canceled', fetched_at = p_now
    from items
    where s.channel_id = items.channel_id
      and s.source = 'twitch_schedule'
      and s.status = 'scheduled'
      and s.scheduled_start > p_now
      and (items.covered_until is null or s.scheduled_start <= items.covered_until)
      and not (items.keep ? s.external_id);
    get diagnostics v_n = row_count;
    return v_n;
end;
$$;

-- ───────────── snapshot 指紋 ─────────────
-- 指紋涵蓋 buildSnapshot 的全部輸入（除了 generated_at 與呼叫端傳入的 heavy_refreshed_at）：
--   場次：status in (scheduled, live) 且非常駐框，加上 actual_end >= p_since 的 ended（與 schedule_snapshot_source 同範圍）；
--     欄位＝輸出或影響輸出的欄位（不含 viewer_count、updated_at、thumbnail_url、channel_id、scheduled_end）；
--     fetched_at 只透過 LIVE_STALE_HOURS（2 小時）影響輸出 → 只納入「直播中是否過期」布林；
--     upcoming（now−3h～now+7d）、recent（12 小時內結束、不晚於 now+1h）依 p_now 算成布林一起納入（時間經過也會改變輸出）。
--   實況主：上述場次用到的 vtubers（name,img_url,nationality,group_id,youtube_channel_id,twitch_channel_id,slug）。
--   團體：vtuber_groups 全表（id,name,kind,parent_id；agencies 清單看全表）。
--   合作：role=collaborator 且依台北日期已開始、未結束的 links。
--   heavy_refreshed_at：live／light 傳的是 schedule_heavy_rss 的 last_run_at → 一併納入。
-- 距上次 mark 達 p_force_minutes（以 p_now 比較）→ changed=true（generated_at 至多這麼久更新一次）。
create or replace function public.schedule_snapshot_check(p_now timestamptz, p_since timestamptz, p_force_minutes integer)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_today date := (p_now at time zone 'Asia/Taipei')::date;
    v_fp text;
    v_prev text;
    v_at timestamptz;
    v_changed boolean;
begin
    with st as (
        select s.id, s.vtuber_id, s.platform, s.external_id, s.source, s.status,
               s.scheduled_start, s.actual_start, s.actual_end, s.title, s.category,
               s.is_schedule_frame, s.merged_with,
               case when s.status = 'live' then p_now - s.fetched_at > interval '2 hours' end as live_stale,
               case when s.status = 'scheduled' then
                   s.scheduled_start is not null
                   and s.scheduled_start <= p_now + interval '7 days'
                   and s.scheduled_start >= p_now - interval '3 hours'
               end as upcoming,
               case when s.status = 'ended' then
                   s.actual_end is not null
                   and p_now - s.actual_end <= interval '12 hours'
                   and s.actual_end <= p_now + interval '1 hour'
               end as recent
        from public.streams s
        where (s.status in ('scheduled', 'live') and not s.is_schedule_frame)
           or (s.status = 'ended' and s.actual_end >= p_since)
    )
    select md5(
        coalesce((select json_agg(json_build_array(
                     id, vtuber_id, platform, external_id, source, status, scheduled_start, actual_start, actual_end,
                     title, category, is_schedule_frame, merged_with, live_stale, upcoming, recent) order by id)::text
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

    select c.last_run_stats->>'fingerprint', c.last_run_at into v_prev, v_at
    from public.cron_shard_state c where c.job_name = 'snapshot';

    v_changed := v_prev is null
        or v_prev <> v_fp
        or v_at is null
        or p_now - v_at >= make_interval(mins => p_force_minutes);
    return json_build_object('changed', v_changed, 'fingerprint', v_fp);
end;
$$;

create or replace function public.schedule_snapshot_mark(p_fingerprint text)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.cron_shard_state (job_name, shard_size, last_run_at, last_run_stats, updated_at)
    values ('snapshot', 0, now(), jsonb_build_object('fingerprint', p_fingerprint), now())
    on conflict (job_name) do update
    set last_run_at = excluded.last_run_at,
        last_run_stats = excluded.last_run_stats,
        updated_at = excluded.updated_at;
$$;

-- ───────────── snapshot 來源 ─────────────
-- 與 snapshot.ts 原本的查詢同範圍、同欄位：
--   active：status in (scheduled, live) 且非常駐框；ended：actual_end >= p_since；都依 id 排序
--   vtubers：active∪ended 用到的；groups：全表；links：role=collaborator、限用到的實況主（since／until 原值，台北日期由 TS 端過濾）
create or replace function public.schedule_snapshot_source(p_since timestamptz)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_out json;
begin
    with active as (
        select s.id, s.vtuber_id, s.channel_id, s.platform, s.external_id, s.source, s.status, s.scheduled_start,
               s.scheduled_end, s.actual_start, s.actual_end, s.title, s.category, s.thumbnail_url, s.is_schedule_frame,
               s.fetched_at, s.merged_with
        from public.streams s
        where s.status in ('scheduled', 'live') and s.is_schedule_frame = false
    ), ended as (
        select s.id, s.vtuber_id, s.channel_id, s.platform, s.external_id, s.source, s.status, s.scheduled_start,
               s.scheduled_end, s.actual_start, s.actual_end, s.title, s.category, s.thumbnail_url, s.is_schedule_frame,
               s.fetched_at, s.merged_with
        from public.streams s
        where s.status = 'ended' and s.actual_end >= p_since
    ), used as (
        select vtuber_id from active union select vtuber_id from ended
    )
    select json_build_object(
        'active', coalesce((select json_agg(a order by a.id) from active a), '[]'::json),
        'ended', coalesce((select json_agg(e order by e.id) from ended e), '[]'::json),
        'vtubers', coalesce((select json_agg(v order by v.id)
                     from (select x.id, x.name, x.img_url, x.nationality, x.group_id, x.youtube_channel_id,
                                  x.twitch_channel_id, x.slug
                           from public.vtubers x where x.id in (select vtuber_id from used)) v), '[]'::json),
        'groups', coalesce((select json_agg(g order by g.id)
                    from (select x.id, x.name, x.kind, x.parent_id from public.vtuber_groups x) g), '[]'::json),
        'links', coalesce((select json_agg(l order by l.vtuber_id, l.group_id)
                   from (select x.vtuber_id, x.group_id, x.since, x.until
                         from public.vtuber_group_links x
                         where x.role = 'collaborator' and x.vtuber_id in (select vtuber_id from used)) l), '[]'::json)
    )
    into v_out;
    return v_out;
end;
$$;

-- ───────────── 雙平台合併的輸入指紋 ─────────────
-- 範圍與欄位＝sweep.ts applyMerges 讀的兩支查詢（status in (scheduled, live)；ended 且 actual_end >= p_ended_since），
-- 欄位＝mergeChanges 的全部輸入（id,vtuber_id,platform,source,status,scheduled_start,actual_start,is_schedule_frame,merged_with）。
-- mergeChanges 是這些輸入的純函式：指紋與上次「算完沒有要改的列」時相同 → 結果必然仍是沒有要改的列，可以跳過整個讀取。
create or replace function public.schedule_merge_check(p_ended_since timestamptz)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_fp text;
    v_prev text;
begin
    select md5(coalesce(json_agg(json_build_array(
               s.id, s.vtuber_id, s.platform, s.source, s.status, s.scheduled_start, s.actual_start,
               s.is_schedule_frame, s.merged_with) order by s.id)::text, ''))
    into v_fp
    from public.streams s
    where s.status in ('scheduled', 'live')
       or (s.status = 'ended' and s.actual_end >= p_ended_since);

    select c.last_run_stats->>'fingerprint' into v_prev
    from public.cron_shard_state c where c.job_name = 'merge';

    return json_build_object('changed', v_prev is null or v_prev <> v_fp, 'fingerprint', v_fp);
end;
$$;

create or replace function public.schedule_merge_mark(p_fingerprint text)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.cron_shard_state (job_name, shard_size, last_run_at, last_run_stats, updated_at)
    values ('merge', 0, now(), jsonb_build_object('fingerprint', p_fingerprint), now())
    on conflict (job_name) do update
    set last_run_at = excluded.last_run_at,
        last_run_stats = excluded.last_run_stats,
        updated_at = excluded.updated_at;
$$;

-- ───────────── 權限：只有 service_role ─────────────
revoke all on function public.schedule_roster(text) from public, anon, authenticated;
revoke all on function public.schedule_unseen_video_ids(text[]) from public, anon, authenticated;
revoke all on function public.schedule_upsert_channel_states(jsonb) from public, anon, authenticated;
revoke all on function public.schedule_twitch_reconcile(timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.schedule_snapshot_check(timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.schedule_snapshot_mark(text) from public, anon, authenticated;
revoke all on function public.schedule_snapshot_source(timestamptz) from public, anon, authenticated;
revoke all on function public.schedule_merge_check(timestamptz) from public, anon, authenticated;
revoke all on function public.schedule_merge_mark(text) from public, anon, authenticated;

grant execute on function public.schedule_roster(text) to service_role;
grant execute on function public.schedule_unseen_video_ids(text[]) to service_role;
grant execute on function public.schedule_upsert_channel_states(jsonb) to service_role;
grant execute on function public.schedule_twitch_reconcile(timestamptz, jsonb) to service_role;
grant execute on function public.schedule_snapshot_check(timestamptz, timestamptz, integer) to service_role;
grant execute on function public.schedule_snapshot_mark(text) to service_role;
grant execute on function public.schedule_snapshot_source(timestamptz) to service_role;
grant execute on function public.schedule_merge_check(timestamptz) to service_role;
grant execute on function public.schedule_merge_mark(text) to service_role;

-- 回滾（Edge Functions 要先退回舊版，否則排程會因找不到函式而整輪失敗）：
--   drop function if exists public.schedule_roster(text);
--   drop function if exists public.schedule_unseen_video_ids(text[]);
--   drop function if exists public.schedule_upsert_channel_states(jsonb);
--   drop function if exists public.schedule_twitch_reconcile(timestamptz, jsonb);
--   drop function if exists public.schedule_snapshot_check(timestamptz, timestamptz, integer);
--   drop function if exists public.schedule_snapshot_mark(text);
--   drop function if exists public.schedule_snapshot_source(timestamptz);
--   drop function if exists public.schedule_merge_check(timestamptz);
--   drop function if exists public.schedule_merge_mark(text);
--   delete from public.cron_shard_state where job_name in ('snapshot', 'merge');
