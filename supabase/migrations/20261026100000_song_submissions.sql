-- 歌回播放清單 v1.2：社群投稿時間軸
--
-- 使用者裁定（2026-10-26）：獨立的歌回投稿表；可投新歌回，也可修正既有時間軸；入口 /songs/submit。
-- 投稿只經 functions/api/songs/submissions.js（service_role，前面有 guardSubmission：Turnstile、配額、來源檢查）。
-- 核准只經 functions/api/admin/song-submissions.js → approve_song_submission：鎖投稿列、寫入（與後台存檔同一套邏輯）、
-- 標記 approved，同一交易。寫入的是管理員微調後的版本；修正型投稿依 id 原地更新，既有 code 不變。
--
-- 回滾：
--   drop function if exists public.approve_song_submission(uuid, uuid, jsonb, jsonb);
--   drop table if exists public.song_submissions;
--   admin_save_song_video 退回 20261025100000 的版本（本檔把本體搬到 _save_song_video，外層只轉呼叫）；
--   drop function if exists public._save_song_video(uuid, jsonb, jsonb);

-- ───────────── 投稿表 ─────────────
create table public.song_submissions (
    id                uuid primary key default gen_random_uuid(),
    kind              text not null check (kind in ('new', 'revision')),
    video_id          text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
    target_video_ref  uuid references public.song_videos(id) on delete set null,
    title             text not null check (char_length(title) between 1 and 200),
    vtuber_id         uuid references public.vtubers(id) on delete set null,
    streamed_at       timestamptz,
    segments          jsonb not null check (jsonb_typeof(segments) = 'array'
                                            and jsonb_array_length(segments) between 1 and 200),
    source_note       text check (source_note is null or char_length(source_note) <= 300),
    submitter_contact text check (submitter_contact is null or char_length(submitter_contact) <= 200),
    ip_hash           text not null check (char_length(ip_hash) between 16 and 128),
    status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    reviewer_notes    text check (reviewer_notes is null or char_length(reviewer_notes) <= 500),
    result_video_ref  uuid references public.song_videos(id) on delete set null,
    created_at        timestamptz not null default now(),
    reviewed_at       timestamptz
    -- 不加「修正型必須有 target_video_ref」的 CHECK：影片被刪時 FK 的 set null 會觸發它而擋下整個刪除；
    -- 目標被刪的修正型投稿在核准時以 p_video_ref null 新建即可，由投稿端點保證寫入時有 target
);

comment on table public.song_submissions is
  '社群投稿的歌回時間軸（新歌回或修正既有）。只由 service_role 讀寫；核准經 approve_song_submission。';

-- 同一個雜湊 IP 對同一支影片同時只能有一筆待審
create unique index song_submissions_pending_ip_video_uq
    on public.song_submissions (ip_hash, video_id) where status = 'pending';

create index song_submissions_status_idx
    on public.song_submissions (status, created_at desc);

alter table public.song_submissions enable row level security;
revoke all on table public.song_submissions from anon, authenticated;

-- ───────────── 存檔本體抽成內部函式（後台存檔與投稿核准共用） ─────────────
create or replace function public._save_song_video(p_id uuid, p_video jsonb, p_segments jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_id uuid;
    v_seg jsonb;
begin
    if p_id is null then
        -- 新影片不可能有既有片段；帶 id 的片段若放行會在下面的新增迴圈被略過而遺失
        if exists (select 1 from jsonb_array_elements(p_segments) e where e->>'id' is not null) then
            raise exception 'unknown_segment_id' using errcode = 'P0001';
        end if;
        insert into public.song_videos (video_id, title, vtuber_id, streamed_at, duration_seconds, status)
        values (p_video->>'video_id', p_video->>'title', (p_video->>'vtuber_id')::uuid,
                (p_video->>'streamed_at')::timestamptz, (p_video->>'duration_seconds')::integer, p_video->>'status')
        returning id into v_id;
    else
        if not exists (select 1 from public.song_videos where id = p_id) then
            raise exception 'video_not_found' using errcode = 'P0002';
        end if;
        if exists (
            select 1 from jsonb_array_elements(p_segments) e
            where e->>'id' is not null
              and not exists (select 1 from public.song_segments s
                              where s.id = (e->>'id')::uuid and s.video_ref = p_id)
        ) then
            raise exception 'unknown_segment_id' using errcode = 'P0001';
        end if;

        update public.song_videos
        set video_id = p_video->>'video_id',
            title = p_video->>'title',
            vtuber_id = (p_video->>'vtuber_id')::uuid,
            streamed_at = (p_video->>'streamed_at')::timestamptz,
            duration_seconds = (p_video->>'duration_seconds')::integer,
            status = p_video->>'status'
        where id = p_id;
        v_id := p_id;

        delete from public.song_segments s
        where s.video_ref = p_id
          and s.id not in (select (e->>'id')::uuid from jsonb_array_elements(p_segments) e where e->>'id' is not null);

        update public.song_segments s
        set start_seconds = (e->>'start_seconds')::integer,
            end_seconds = (e->>'end_seconds')::integer,
            title = e->>'title',
            original_artist = e->>'original_artist',
            position = (e->>'position')::smallint
        from jsonb_array_elements(p_segments) e
        where e->>'id' is not null
          and s.id = (e->>'id')::uuid
          and (s.start_seconds, s.end_seconds, s.title, s.original_artist, s.position)
              is distinct from ((e->>'start_seconds')::integer, (e->>'end_seconds')::integer, e->>'title',
                                e->>'original_artist', (e->>'position')::smallint);
    end if;

    -- 新片段：code 由 default 產生，撞號（極少見）就重抽，最多 5 次
    for v_seg in select e from jsonb_array_elements(p_segments) e where e->>'id' is null loop
        for attempt in 1..5 loop
            begin
                insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position)
                values (v_id, (v_seg->>'start_seconds')::integer, (v_seg->>'end_seconds')::integer,
                        v_seg->>'title', v_seg->>'original_artist', (v_seg->>'position')::smallint);
                exit;
            exception when unique_violation then
                if attempt = 5 then raise; end if;
            end;
        end loop;
    end loop;

    return json_build_object(
        'id', v_id,
        'segments', coalesce((
            select json_agg(json_build_object(
                       'id', s.id, 'code', s.code, 'start_seconds', s.start_seconds, 'end_seconds', s.end_seconds,
                       'title', s.title, 'original_artist', s.original_artist, 'position', s.position)
                   order by s.start_seconds)
            from public.song_segments s
            where s.video_ref = v_id
        ), '[]'::json)
    );
end;
$$;

create or replace function public.admin_save_song_video(p_id uuid, p_video jsonb, p_segments jsonb)
returns json
language sql
volatile
security definer
set search_path = ''
as $$
    select public._save_song_video(p_id, p_video, p_segments);
$$;

-- ───────────── 核准投稿（單一交易） ─────────────
create or replace function public.approve_song_submission(p_id uuid, p_video_ref uuid, p_video jsonb, p_segments jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_status text;
    v_result json;
begin
    select status into v_status from public.song_submissions where id = p_id for update;
    if v_status is null or v_status <> 'pending' then
        raise exception 'not_pending' using errcode = 'P0001';
    end if;

    v_result := public._save_song_video(p_video_ref, p_video, p_segments);

    update public.song_submissions
    set status = 'approved', reviewed_at = now(), result_video_ref = (v_result->>'id')::uuid
    where id = p_id;

    return v_result;
end;
$$;

revoke all on function public._save_song_video(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_save_song_video(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.approve_song_submission(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public._save_song_video(uuid, jsonb, jsonb) to service_role;
grant execute on function public.admin_save_song_video(uuid, jsonb, jsonb) to service_role;
grant execute on function public.approve_song_submission(uuid, uuid, jsonb, jsonb) to service_role;
