-- 時間未定場次（2026-10-14）：streams.time_tbd
--
-- 社群週表圖／使用者投稿常只寫日期、沒寫開台時間（「時間未定」「晚上見」）。原本 approve_schedule_contribution
-- 把空白時間當 00:00，而 00:00 早於 now−3h 就被跳過、寫進去也會被當成午夜場次排序與過期。
-- 改成：
--   - streams.time_tbd boolean（預設 false）；true 時 scheduled_start 存該台北日期 00:00。
--     「還沒過」＝ now < scheduled_start + 24h（台北當天結束）。只有非影片來源（community_post／user_submission）可以是 true（CHECK）。
--   - approve_schedule_contribution：entry 的 time 空白／null → time_tbd=true、scheduled_start＝台北當天 00:00；寫入 announced_at＝發文時間（讀圖送審取 payload.published_at，否則投稿時間）；
--     「早於 now−3h 就跳過」對時間未定改成「台北當天結束已過才跳過」；INSERT 與 ON CONFLICT DO UPDATE 都帶 time_tbd。
--   - schedule_snapshot_source：場次欄位加 time_tbd（只在 true 時輸出 true，其餘 null；snapshot.ts toItem 只在 true 時輸出）。
--   - schedule_snapshot_check：upcoming 下限遇時間未定改成 scheduled_start + 24h > 量化 now；指紋加 time_tbd。
--   - schedule_merge_fp：ended 主場次候選的 30 分鐘窗，對時間未定的非影片場次改成「同台北日期」（與 merge.ts 一致）；指紋加 time_tbd、announced_at、created_at、external_id。
--   - streams.announced_at timestamptz null：發文時間（社群週表＝貼文發文時間，由 schedule-posts 腳本直接寫入、或送審時放 payload.published_at
--     由 approve_schedule_contribution 寫入；使用者投稿＝vtuber_contributions.created_at）。時間未定列只由開始時間不早於它的場次兌現（merge.ts fulfills；沒有才用 created_at 寫入時間）。
--   - 部分索引 streams_expired_nonvideo_idx：applyMerges 讀「昨天起已過期的社群週表／投稿具體時間列」用。
--   - refresh_schedule_indexable：「接下來」的 15 分鐘寬限對時間未定改成台北當天結束未過（與 personSource.ts 一致）。
-- Edge Function 端（_shared/rules.ts、merge.ts、sweep.ts、snapshot.ts）同步支援；sweep.expireOverdue 時間未定場次以 now−24h 過期。
-- 函式本體複製自：
--   approve_schedule_contribution  ← 20261005100000_schedule_community_posts.sql
--   schedule_snapshot_check／schedule_snapshot_source／schedule_merge_fp ← 20261009010554_schedule_rpc_egress_v2.sql
--   refresh_schedule_indexable     ← 20261008135719_schedule_indexable_align.sql
-- security definer、search_path、grant／revoke 與原定義相同。
--
-- 部署順序：本 migration 先套（新欄位預設 false，舊版 Edge Function 讀 time_tbd 以外的欄位不受影響；
--   但舊版 sweep 的 expireOverdue 會用 3 小時規則把時間未定場次提早過期），再部署 schedule-* Edge Functions。
--
-- 回滾（Edge Functions 要先退回不認得 time_tbd 的版本；時間未定場次會回到「00:00 場次」語意，3 小時後過期）：
--   重新套下列檔案裡的舊函式本體：
--     20261005100000_schedule_community_posts.sql 的 approve_schedule_contribution（含 revoke／grant）
--     20261009010554_schedule_rpc_egress_v2.sql 的 schedule_snapshot_check、schedule_snapshot_source、schedule_merge_fp（含 revoke／grant）
--     20261008135719_schedule_indexable_align.sql 的 refresh_schedule_indexable（含 revoke／grant），再 select public.refresh_schedule_indexable();
--   然後：
--   update public.cron_shard_state set last_run_stats = last_run_stats - 'fingerprint' where job_name in ('snapshot', 'merge');
--   drop column 前，前端（Cloudflare Pages）也要先退回不含 time_tbd 的版本：src/features/schedule/personSource.ts 與
--   functions/lib/schedule-person.js 的 select 帶 time_tbd，欄位不存在時 PostgREST 會回 400、個人週表頁整頁讀不到。
--   drop column 前，Edge Functions（sweep.ts applyMerges 的 select 帶 announced_at）與 scripts/schedule-posts（寫 announced_at）也要先退回。
--   drop index if exists public.streams_expired_nonvideo_idx;
--   alter table public.streams drop column if exists announced_at;
--   alter table public.streams drop constraint if exists streams_time_tbd_source_check;
--   alter table public.streams drop column if exists time_tbd;

-- ===== 1. streams.time_tbd =====
alter table public.streams add column if not exists time_tbd boolean not null default false;

alter table public.streams drop constraint if exists streams_time_tbd_source_check;
alter table public.streams add constraint streams_time_tbd_source_check
    check (not time_tbd or source in ('community_post', 'user_submission'));

alter table public.streams add column if not exists announced_at timestamptz;

comment on column public.streams.announced_at is
  '發文時間（社群週表＝貼文發文時間、投稿＝投稿時間）；時間未定列只由開始時間不早於它的場次兌現（合併或過期），null 時改用 created_at。';

-- applyMerges 每輪讀「昨天起已過期的社群週表／投稿具體時間列」（同來源同日已有具體時間 → 時間未定列不合併）
create index if not exists streams_expired_nonvideo_idx on public.streams (scheduled_start)
    where status = 'expired' and source in ('community_post', 'user_submission') and not time_tbd;

comment on column public.streams.time_tbd is
  '時間未定（只有 community_post／user_submission）：scheduled_start 存該台北日期 00:00，台北當天結束（scheduled_start + 24h）前都算還沒過；snapshot 排在當天最後。';

-- ===== 2. 核准週表投稿：時間空白＝時間未定 =====
-- p_entries：審核者改過的列（null＝照投稿 payload.entries）。每列 {date:'YYYY-MM-DD', time:'HH:MM'|''|null, title, platform:'youtube'|'twitch'}，
-- 時間以台北時間解讀；time 空白／null → 時間未定（time_tbd=true、scheduled_start＝台北當天 00:00）。
-- 來源：payload.source='vision' → streams.source='community_post'、external_id='post:<payload.post_id>:<n>'；
-- 其他 → 'user_submission'、'sub:<投稿 id>:<n>'。
-- 取代：同一位 VTuber、同一來源、排定日期（台北）落在這批列的日期範圍內、還是 scheduled 的舊列改 canceled（新週表取代舊週表）。
-- 已過的列不寫：一般列早於 now−3h（與 expireOverdue 的寬限一致）；時間未定列台北當天結束已過。
-- 回傳 {vtuber_id, slug, written, canceled}。錯誤：not_found／not_pending／unsupported_action／no_entries／invalid_entry／channel_not_found。
create or replace function public.approve_schedule_contribution(p_id uuid, p_entries jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    c public.vtuber_contributions%rowtype;
    p jsonb;
    entries jsonb;
    e jsonb;
    v_vt uuid;
    v_slug text;
    v_source text;
    v_prefix text;
    v_platform text;
    v_channel uuid;
    v_start timestamptz;
    v_time text;
    v_tbd boolean;
    v_announced timestamptz;
    v_title text;
    v_n int := 0;
    v_written int := 0;
    v_canceled int := 0;
    d_min date;
    d_max date;
begin
    select * into c from public.vtuber_contributions where id = p_id for update;
    if not found then
        raise exception 'not_found' using errcode = 'P0002';
    end if;
    if c.status <> 'pending' then
        raise exception 'not_pending' using errcode = 'P0001';
    end if;
    if c.action <> 'schedule' then
        raise exception 'unsupported_action' using errcode = 'P0001';
    end if;

    p := c.payload;
    v_vt := coalesce(c.target_vtuber_id, (p ->> 'vtuber_id')::uuid);
    select slug into v_slug from public.vtubers where id = v_vt;
    if v_slug is null then
        raise exception 'not_found' using errcode = 'P0002';
    end if;

    entries := coalesce(p_entries, p -> 'entries');
    if entries is null or jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) = 0 or jsonb_array_length(entries) > 14 then
        raise exception 'no_entries' using errcode = '22023';
    end if;

    if coalesce(p ->> 'source', 'user') = 'vision' and nullif(p ->> 'post_id', '') is not null then
        v_source := 'community_post';
        v_prefix := 'post:' || (p ->> 'post_id') || ':';
        -- 讀圖送審：payload.published_at（貼文發文時間，schedule-posts 腳本寫入）是 ISO 8601 才採用；
        -- 先 regex 再轉型，日曆上不存在的值（2026-02-30）轉型失敗也只退回 created_at、不讓核准失敗
        if coalesce(p ->> 'published_at', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then
            begin
                v_announced := (p ->> 'published_at')::timestamptz;
            exception when others then
                v_announced := null;
            end;
        end if;
    else
        v_source := 'user_submission';
        v_prefix := 'sub:' || p_id::text || ':';
    end if;

    -- 日期範圍（取代舊列用）
    select min((x ->> 'date')::date), max((x ->> 'date')::date) into d_min, d_max
    from jsonb_array_elements(entries) x;
    if d_min is null then
        raise exception 'invalid_entry' using errcode = '22023';
    end if;

    update public.streams
    set status = 'canceled', fetched_at = now()
    where vtuber_id = v_vt
      and source = v_source
      and status = 'scheduled'
      and scheduled_start is not null
      and (scheduled_start at time zone 'Asia/Taipei')::date between d_min and d_max;
    get diagnostics v_canceled = row_count;

    for e in select * from jsonb_array_elements(entries) loop
        v_n := v_n + 1;
        v_platform := case when e ->> 'platform' = 'twitch' then 'twitch' else 'youtube' end;
        v_title := nullif(left(btrim(coalesce(e ->> 'title', '')), 300), '');
        v_time := nullif(btrim(coalesce(e ->> 'time', '')), '');
        v_tbd := v_time is null;
        begin
            v_start := ((e ->> 'date') || ' ' || coalesce(v_time, '00:00'))::timestamp at time zone 'Asia/Taipei';
        exception when others then
            raise exception 'invalid_entry' using errcode = '22023';
        end;
        if v_start is null then
            continue;
        end if;
        if v_tbd then
            if v_start + interval '24 hours' <= now() then
                continue; -- 時間未定：台北當天已結束才不寫（與 expireOverdue 的 now−24h 一致）
            end if;
        elsif v_start < now() - interval '3 hours' then
            continue; -- 已過的列不寫（與 expireOverdue 的寬限一致）
        end if;
        select id into v_channel from public.vtuber_channels
        where vtuber_id = v_vt and platform = v_platform and status = 'active'
        order by (external_id is not null) desc, created_at
        limit 1;
        if v_channel is null then
            -- 投稿標 Twitch 但這個人沒有 Twitch 頻道：退回 YouTube 頻道
            v_platform := 'youtube';
            select id into v_channel from public.vtuber_channels
            where vtuber_id = v_vt and platform = 'youtube' and status = 'active'
            order by created_at limit 1;
        end if;
        if v_channel is null then
            raise exception 'channel_not_found' using errcode = 'P0002';
        end if;

        -- announced_at＝發文時間（讀圖送審＝payload.published_at；使用者投稿或格式不對＝投稿時間 vtuber_contributions.created_at）：
        -- 時間未定列只由這之後才開始的場次兌現。使用者投稿端點（functions/api/schedule/entries.js）固定寫 source='user'，不會走到 published_at
        insert into public.streams (vtuber_id, channel_id, platform, external_id, source, status, scheduled_start, time_tbd, announced_at, title, is_schedule_frame, fetched_at)
        values (v_vt, v_channel, v_platform, v_prefix || v_n::text, v_source, 'scheduled', v_start, v_tbd, coalesce(v_announced, c.created_at), v_title, false, now())
        on conflict (platform, external_id) do update
            set status = 'scheduled',
                scheduled_start = excluded.scheduled_start,
                time_tbd = excluded.time_tbd,
                announced_at = excluded.announced_at,
                title = excluded.title,
                vtuber_id = excluded.vtuber_id,
                channel_id = excluded.channel_id,
                merged_with = null,
                fetched_at = now(),
                updated_at = now();
        v_written := v_written + 1;
    end loop;

    update public.vtuber_contributions
    set status = 'approved',
        target_vtuber_id = v_vt,
        reviewed_at = now(),
        reviewer_notes = nullif(left(coalesce(p ->> 'reviewer_notes', ''), 500), '')
    where id = p_id;

    insert into public.admin_actions (admin_user_id, actor, action_type, target_id, decision, before_status, after_status, metadata)
    values (null, 'admin_token', 'review_vtuber_contribution', p_id, 'approve', 'pending', 'approved',
            jsonb_build_object('vtuber_id', v_vt, 'slug', v_slug, 'kind', 'schedule', 'written', v_written, 'canceled', v_canceled));

    return jsonb_build_object('vtuber_id', v_vt, 'slug', v_slug, 'written', v_written, 'canceled', v_canceled);
end;
$$;

revoke all on function public.approve_schedule_contribution(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.approve_schedule_contribution(uuid, jsonb) to service_role;

-- ===== 3. snapshot 指紋：時間未定的 upcoming 下限＝台北當天結束；指紋加 time_tbd =====
-- 其餘同 20261009010554（時間邊界用 v_q＝p_now 往下取整到 30 分鐘；fingerprint＝「md5@check 時間（epoch 毫秒）」）。
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
                     title, category, is_schedule_frame, merged_with, live_stale, upcoming, recent, time_tbd) order by id)::text
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

    -- 上次 mark：fingerprint（md5）與 checked_at（mark 對應的 check 時間；舊格式沒有就用 last_run_at）
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

-- ===== 4. snapshot 來源：場次欄位加 time_tbd（true 才輸出 true，其餘 null 省流量） =====
create or replace function public.schedule_snapshot_source(p_since timestamptz)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_scols constant text := '["id","vtuber_id","platform","external_id","source","status","scheduled_start","actual_start","actual_end","title","category","is_schedule_frame","fetched_at","merged_with","time_tbd"]';
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
               public.schedule_jcell(case when r.time_tbd then true end) || ']' as cell
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

-- ===== 5. 雙平台合併指紋：時間未定的非影片場次用「同台北日期」 =====
-- 其餘同 20261009010554：ended 只在同一實況主有 scheduled／live、且開始時間相差 30 分鐘內時才算；
-- 新增：該 scheduled／live 是時間未定的社群週表／投稿時，改成「同一台北日期」（merge.ts mergeGap）。
-- 指紋另加 time_tbd、announced_at／created_at（時間未定列只由開始時間不早於發文時間的場次兌現，沒有發文時間才用寫入時間）、external_id（同來源鍵）。
-- applyMerges 另讀的「昨天起已過期的社群週表／投稿具體時間列」（同來源同日已有具體時間 → 時間未定列不合併）不進指紋：
-- 那些列只會由 scheduled 變 expired 加入（離開 act → 指紋已變），移出讀取範圍時對應的時間未定列早已過期。
create or replace function public.schedule_merge_fp(p_ended_since timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    with act as (
        select s.id, s.vtuber_id, s.platform, s.source, s.status, s.scheduled_start, s.actual_start, s.merged_with, s.time_tbd, s.announced_at, s.created_at, s.external_id
        from public.streams s
        where s.status in ('scheduled', 'live')
          and not s.is_schedule_frame
          and coalesce(s.actual_start, s.scheduled_start) is not null
    ), ended as (
        select s.id, s.vtuber_id, s.platform, s.source, s.status, s.scheduled_start, s.actual_start, null::uuid as merged_with, s.time_tbd, s.announced_at, s.created_at, s.external_id
        from public.streams s
        where s.status = 'ended'
          and s.actual_end >= p_ended_since
          and not s.is_schedule_frame
          and exists (
              -- 只有和同一實況主的 scheduled／live 開始時間相差在合併窗（30 分鐘，多留 1 秒避免毫秒捨入）內，ended 才可能被選為主場次；
              -- 時間未定的社群週表／投稿：同一台北日期就可能被選
              select 1 from act a
              where a.vtuber_id = s.vtuber_id
                and (
                    abs(extract(epoch from coalesce(a.actual_start, a.scheduled_start) - coalesce(s.actual_start, s.scheduled_start))) <= 1801
                    or (a.time_tbd
                        and a.source in ('community_post', 'user_submission')
                        and (coalesce(a.actual_start, a.scheduled_start) at time zone 'Asia/Taipei')::date
                            = (coalesce(s.actual_start, s.scheduled_start) at time zone 'Asia/Taipei')::date)
                )
          )
    ), allr as (
        select * from act union all select * from ended
    )
    select md5(coalesce(json_agg(json_build_array(
               a.id, a.vtuber_id, a.platform, a.source, a.status, a.scheduled_start, a.actual_start, a.merged_with, a.time_tbd,
               a.announced_at, a.created_at, a.external_id)
               order by a.id)::text, ''))
    from allr a;
$$;

-- ===== 6. 個人週表頁可索引：時間未定的「接下來」到台北當天結束 =====
-- 其餘同 20261008135719（改天數要同步改 personSource.ts 的常數）。
create or replace function public.refresh_schedule_indexable()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    changed integer;
begin
    with active as (
        select distinct vtuber_id
        from public.streams
        where not is_schedule_frame
          and merged_with is null
          and (
              status = 'live'
              or (status = 'scheduled'
                  and case when time_tbd then scheduled_start + interval '24 hours' > now()
                           else scheduled_start >= now() - interval '15 minutes' end
                  and scheduled_start <= now() + interval '7 days')
              or (status = 'ended' and actual_end >= now() - interval '90 days')
          )
    )
    update public.vtubers v
    set schedule_indexable = (a.vtuber_id is not null)
    from public.vtubers v2
    left join active a on a.vtuber_id = v2.id
    where v2.id = v.id
      and v.schedule_indexable is distinct from (a.vtuber_id is not null);
    get diagnostics changed = row_count;
    return changed;
end;
$$;

-- ===== 權限（create or replace 保留既有權限；再宣告一次保險，與原定義相同） =====
revoke all on function public.schedule_snapshot_check(timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.schedule_snapshot_source(timestamptz) from public, anon, authenticated;
revoke all on function public.schedule_merge_fp(timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_schedule_indexable() from public, anon, authenticated;
grant execute on function public.schedule_snapshot_check(timestamptz, timestamptz, integer) to service_role;
grant execute on function public.schedule_snapshot_source(timestamptz) to service_role;
grant execute on function public.schedule_merge_fp(timestamptz) to service_role;
grant execute on function public.refresh_schedule_indexable() to service_role;
