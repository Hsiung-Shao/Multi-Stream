-- 社群週表圖片解析（本機腳本）＋使用者投稿週表（2026-10-05，決策見 Obsidian 2026-10-05-multi-stream-社群週表圖片解析與投稿）
--
-- 1. streams.source 加 'community_post'（YouTube 社群貼文的週表圖，由本機腳本 scripts/schedule-posts 以視覺模型解析）
--    與 'user_submission'（使用者投稿表格、後台核准）。這兩種來源沒有影片 ID：
--    external_id 為 post:<postId>:<n>／sub:<contributionId>:<n>，不能拿去 videos.list，也不能當 videoId 給收藏輪詢
--    （_shared/sweep.ts 的 loadPendingYouTube／loadCurrentByChannel 已排除）。
-- 2. schedule_community_posts：已看過的社群貼文（去重：同一貼文不再送模型）＋模型輸出稽核＋token 成本。僅 service_role。
-- 3. vtuber_contributions.action 加 'schedule'：低信心的自動解析與使用者投稿走同一個待審佇列。
--    payload：{ vtuber_id, channel_id, platform, entries:[{date, time, title, platform}], note, source:'user'|'vision', post_id?, post_url?, image_url? }
--    同一位 VTuber 只能有一筆待審的週表投稿（部分唯一索引）。
-- 4. approve_schedule_contribution(p_id, p_entries)：核准在單一交易裡寫 streams、取代同頻道同來源日期重疊的舊場次、改投稿狀態、寫稽核。
--
-- 回滾：
--   drop function if exists public.approve_schedule_contribution(uuid, jsonb);
--   drop index if exists public.vtuber_contributions_pending_schedule_uq;
--   drop table if exists public.schedule_community_posts;
--   alter table public.vtuber_contributions drop constraint if exists vtuber_contributions_action_check;
--   alter table public.vtuber_contributions add constraint vtuber_contributions_action_check check (action in ('add','edit','delete'));
--   update public.streams set status = 'hidden' where source in ('community_post', 'user_submission');  -- 或 delete
--   alter table public.streams drop constraint if exists streams_source_check;
--   alter table public.streams add constraint streams_source_check check (source in ('yt_waiting_room', 'twitch_schedule', 'twitch_live', 'manual'));

-- ===== 1. streams.source =====
alter table public.streams drop constraint if exists streams_source_check;
alter table public.streams add constraint streams_source_check
    check (source in ('yt_waiting_room', 'twitch_schedule', 'twitch_live', 'manual', 'community_post', 'user_submission'));

comment on column public.streams.source is
  'yt_waiting_room＝YouTube 待機室／直播；twitch_schedule／twitch_live；community_post＝社群貼文週表圖（視覺模型解析，external_id=post:<postId>:<n>）；user_submission＝使用者投稿（external_id=sub:<contributionId>:<n>）；manual';

-- ===== 2. schedule_community_posts =====
create table if not exists public.schedule_community_posts (
    post_id         text primary key check (char_length(post_id) between 10 and 64),
    channel_id      uuid not null references public.vtuber_channels(id) on delete cascade,
    published_at    timestamptz,
    text_excerpt    text check (text_excerpt is null or char_length(text_excerpt) <= 300),
    image_url       text check (image_url is null or char_length(image_url) <= 2048),
    status          text not null check (status in ('skipped_keyword', 'parsed', 'not_schedule', 'pending_review', 'error')),
    confidence      real check (confidence is null or (confidence >= 0 and confidence <= 1)),
    parsed          jsonb,
    entries_written integer not null default 0 check (entries_written >= 0),
    input_tokens    integer not null default 0 check (input_tokens >= 0),
    output_tokens   integer not null default 0 check (output_tokens >= 0),
    model           text check (model is null or char_length(model) <= 64),
    error           text check (error is null or char_length(error) <= 500),
    created_at      timestamptz not null default now()
);

comment on table public.schedule_community_posts is
  '本機腳本 scripts/schedule-posts 看過的 YouTube 社群貼文：去重（同一貼文不再送視覺模型）、模型輸出稽核、token 成本與每日上限計數。僅 service_role 可存取。';

create index if not exists schedule_community_posts_channel_idx on public.schedule_community_posts (channel_id, created_at desc);
create index if not exists schedule_community_posts_created_idx on public.schedule_community_posts (created_at desc);

alter table public.schedule_community_posts enable row level security;
-- 沒有 policy：anon／authenticated 都讀不到；service_role 繞過 RLS

-- ===== 3. vtuber_contributions.action =====
alter table public.vtuber_contributions drop constraint if exists vtuber_contributions_action_check;
alter table public.vtuber_contributions add constraint vtuber_contributions_action_check
    check (action in ('add', 'edit', 'delete', 'schedule'));

-- 同一位 VTuber 只能有一筆待審的週表投稿
create unique index if not exists vtuber_contributions_pending_schedule_uq
    on public.vtuber_contributions (target_vtuber_id)
    where status = 'pending' and action = 'schedule' and target_vtuber_id is not null;

-- ===== 4. 核准週表投稿 =====
-- p_entries：審核者改過的列（null＝照投稿 payload.entries）。每列 {date:'YYYY-MM-DD', time:'HH:MM', title, platform:'youtube'|'twitch'}，
-- 時間以台北時間解讀。來源：payload.source='vision' → streams.source='community_post'、external_id='post:<payload.post_id>:<n>'；
-- 其他 → 'user_submission'、'sub:<投稿 id>:<n>'。
-- 取代：同一位 VTuber、同一來源、排定日期（台北）落在這批列的日期範圍內、還是 scheduled 的舊列改 canceled（新週表取代舊週表）。
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
        begin
            v_start := ((e ->> 'date') || ' ' || coalesce(nullif(e ->> 'time', ''), '00:00'))::timestamp at time zone 'Asia/Taipei';
        exception when others then
            raise exception 'invalid_entry' using errcode = '22023';
        end;
        if v_start is null or v_start < now() - interval '3 hours' then
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

        insert into public.streams (vtuber_id, channel_id, platform, external_id, source, status, scheduled_start, title, is_schedule_frame, fetched_at)
        values (v_vt, v_channel, v_platform, v_prefix || v_n::text, v_source, 'scheduled', v_start, v_title, false, now())
        on conflict (platform, external_id) do update
            set status = 'scheduled',
                scheduled_start = excluded.scheduled_start,
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
