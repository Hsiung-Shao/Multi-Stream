-- 投稿接上帳號（2026-11-28）
-- 1) 四張投稿表加 user_id：登入者送出時由 Pages Function（service_role）寫入；刪帳號時設成 null，投稿保留、只拿掉關聯。
-- 2) community_save_song_video：從 p_meta.user_id 寫入 song_submissions.user_id（其餘與 20261127090000 相同）。
-- 3) my_submissions()：登入者看自己最近 50 筆投稿（只回類型、時間、狀態、標題；不回聯絡方式、IP 雜湊、管理者備註）。
-- 4) claim_announcement_responses()：登入時把這台裝置的匿名問卷答案歸到帳號（只給 service_role）。
-- 回滾：drop function my_submissions、claim_announcement_responses；community_save_song_video 重跑 20261127090000 的定義；
--       四張表 drop column user_id（會失去歸屬資料）。

alter table public.vtuber_contributions add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.vtuber_reports       add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.song_submissions     add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.feedbacks            add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists vtuber_contributions_user_id_idx on public.vtuber_contributions (user_id) where user_id is not null;
create index if not exists vtuber_reports_user_id_idx       on public.vtuber_reports (user_id) where user_id is not null;
create index if not exists song_submissions_user_id_idx     on public.song_submissions (user_id) where user_id is not null;
create index if not exists feedbacks_user_id_idx            on public.feedbacks (user_id) where user_id is not null;

create or replace function public.community_save_song_video(
    p_video_id text, p_rev timestamptz, p_video jsonb, p_segments jsonb, p_meta jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v public.song_videos;
    v_before jsonb := null;
    v_segs jsonb;
    v_kind text;
    v_result json;
    v_ref uuid;
    v_rev timestamptz;
    v_vtuber uuid;
    v_sub uuid;
begin
    select * into v from public.song_videos where video_id = p_video_id for update;

    if found then
        v_kind := 'revision';
        -- 草稿或鎖定的歌回先擋（不論有沒有帶 p_rev），這樣被擋的人看到的是「已鎖定」而不是誤導的「重新整理」
        if v.status <> 'published' or v.community_locked then
            raise exception 'video_locked' using errcode = 'P0001';
        end if;
        -- 呼叫端以為是新歌回，其實已有人建立 → 請對方重新整理
        if p_rev is null then
            raise exception 'video_exists' using errcode = 'P0001';
        end if;
        if v.updated_at <> p_rev then
            raise exception 'stale_edit' using errcode = 'P0001';
        end if;
        -- code 必須屬於這支影片，且不能重複出現
        if exists (
            select 1 from jsonb_array_elements(p_segments) e
            where e->>'code' is not null
              and not exists (select 1 from public.song_segments s where s.video_ref = v.id and s.code = e->>'code')
        ) or (
            select count(e->>'code') <> count(distinct e->>'code') from jsonb_array_elements(p_segments) e
        ) then
            raise exception 'unknown_segment' using errcode = 'P0001';
        end if;
        -- 不能刪：既有片段的 code 都要在
        if exists (
            select 1 from public.song_segments s
            where s.video_ref = v.id
              and not exists (select 1 from jsonb_array_elements(p_segments) e where e->>'code' = s.code)
        ) then
            raise exception 'cannot_delete' using errcode = 'P0001';
        end if;

        v_before := jsonb_build_object(
            'video', jsonb_build_object('title', v.title, 'vtuber_id', v.vtuber_id, 'streamed_at', v.streamed_at,
                                        'duration_seconds', v.duration_seconds,
                                        'clip_channel_name', v.clip_channel_name, 'clip_channel_url', v.clip_channel_url),
            'segments', coalesce((
                select jsonb_agg(jsonb_build_object(
                           'id', s.id, 'code', s.code, 'song_id', s.song_id,
                           'start_seconds', s.start_seconds, 'end_seconds', s.end_seconds,
                           'title', s.title, 'original_artist', s.original_artist, 'version_note', s.version_note,
                           'position', s.position, 'performers', public._segment_performers_json(s.id))
                       order by s.start_seconds)
                from public.song_segments s where s.video_ref = v.id), '[]'::jsonb));

        -- code → id（_save_song_video 依 id 原地更新，code 不變）
        select coalesce(jsonb_agg(
                   case when s.id is null then t.e - 'code'
                        else (t.e - 'code') || jsonb_build_object('id', s.id) end
                   order by t.n), '[]'::jsonb)
        into v_segs
        from jsonb_array_elements(p_segments) with ordinality as t(e, n)
        left join public.song_segments s on s.video_ref = v.id and s.code = t.e->>'code';

        v_result := public._save_song_video(v.id, jsonb_build_object(
            'video_id', v.video_id,
            'title', p_video->>'title',
            -- 可換人、不能清空：送 null 或空字串就沿用原本的 VTuber
            'vtuber_id', coalesce(nullif(p_video->>'vtuber_id', ''), v.vtuber_id::text),
            -- 送來的值只有毫秒精度（後端正規化）：毫秒相同視為沒改，保留原值（含微秒），避免每次修正都被截尾
            'streamed_at', case when nullif(p_video->>'streamed_at', '')::timestamptz
                                     is not distinct from date_trunc('milliseconds', v.streamed_at)
                                then v.streamed_at::text else p_video->>'streamed_at' end,
            'duration_seconds', coalesce(v.duration_seconds::text, p_video->>'duration_seconds'),
            'status', v.status) || public._clip_keys(p_video), v_segs);
    else
        v_kind := 'new';
        if nullif(p_video->>'vtuber_id', '') is null then
            raise exception 'vtuber_required' using errcode = 'P0001';
        end if;
        if exists (select 1 from jsonb_array_elements(p_segments) e where e->>'code' is not null) then
            raise exception 'unknown_segment' using errcode = 'P0001';
        end if;
        begin
            v_result := public._save_song_video(null, jsonb_build_object(
                'video_id', p_video_id,
                'title', p_video->>'title',
                'vtuber_id', p_video->>'vtuber_id',
                'streamed_at', p_video->>'streamed_at',
                'duration_seconds', p_video->>'duration_seconds',
                'status', 'published') || public._clip_keys(p_video), p_segments);
        exception when unique_violation then
            -- 同時有人建立同一支影片
            raise exception 'video_exists' using errcode = 'P0001';
        end;
    end if;

    v_ref := (v_result->>'id')::uuid;
    -- 紀錄存「實際生效」的 VTuber（修正送 null 時是沿用的原值），後台摘要才不會誤判成改了 VTuber
    select updated_at, vtuber_id into v_rev, v_vtuber from public.song_videos where id = v_ref;

    insert into public.song_submissions (
        kind, video_id, target_video_ref, title, vtuber_id, streamed_at, segments,
        source_note, submitter_contact, ip_hash, status, before, result_video_ref, clip, user_id)
    values (
        v_kind, p_video_id, case when v_kind = 'revision' then v_ref end, p_video->>'title',
        v_vtuber, (p_video->>'streamed_at')::timestamptz, p_segments,
        p_meta->>'source_note', p_meta->>'submitter_contact', p_meta->>'ip_hash', 'applied', v_before, v_ref,
        nullif(public._clip_keys(p_video), '{}'::jsonb),
        nullif(p_meta->>'user_id', '')::uuid)
    returning id into v_sub;

    return json_build_object('kind', v_kind, 'video_ref', v_ref, 'rev', v_rev, 'submission_id', v_sub);
end;
$$;

create or replace function public.my_submissions()
returns table (kind text, id uuid, created_at timestamptz, status text, title text)
language sql
stable
security definer
set search_path = ''
as $$
    select * from (
        select c.action, c.id, c.created_at, c.status,
               left(coalesce(c.payload->>'vtuber_name', c.payload->>'name', c.youtube_channel_id, ''), 80)
          from public.vtuber_contributions c where c.user_id = auth.uid()
        union all
        select 'report', r.id, r.created_at, r.status, left(coalesce(r.description, ''), 80)
          from public.vtuber_reports r where r.user_id = auth.uid()
        union all
        select 'song', s.id, s.created_at, s.status, left(coalesce(s.title, s.video_id, ''), 80)
          from public.song_submissions s where s.user_id = auth.uid()
        union all
        select 'feedback', f.id, f.created_at, f.status, left(coalesce(f.content, ''), 80)
          from public.feedbacks f where f.user_id = auth.uid()
    ) t (kind, id, created_at, status, title)
    where auth.uid() is not null
    order by created_at desc
    limit 50;
$$;

revoke all on function public.my_submissions() from public, anon;
grant execute on function public.my_submissions() to authenticated;

create or replace function public.claim_announcement_responses(p_user_id uuid, p_device_id text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    n int;
begin
    if p_user_id is null or p_device_id is null or p_device_id = '' then
        return 0;
    end if;
    -- 該帳號已作答的公告不覆蓋（匿名那筆留著）
    update public.announcement_responses r
       set user_id = p_user_id
     where r.device_id = p_device_id
       and r.user_id is null
       and not exists (
           select 1 from public.announcement_responses x
            where x.announcement_id = r.announcement_id and x.user_id = p_user_id);
    get diagnostics n = row_count;
    return n;
end;
$$;

revoke all on function public.claim_announcement_responses(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_announcement_responses(uuid, text) to service_role;
