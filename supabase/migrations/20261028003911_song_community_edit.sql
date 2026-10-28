-- 歌回時間軸改成社群直接編輯（免審核）＋單曲標記
--
-- 使用者裁定（2026-10-28）：
--   - 社群送出即生效，不再經後台審核；後台以「修改紀錄＋一鍵還原＋鎖定單場」把關。
--   - 社群不能刪既有片段（只能修改與新增）；既有歌回的標題、VTuber、開台時間社群可改。
--   - 同時編輯以影片 updated_at 當版本（rev）比對，不一致就擋下。新歌回必填 VTuber。
--   - 單曲影片：影片長度 ≤ 600 秒且只有一段，目錄標 k='single'（前端的結束估計用同一條規則）。
-- 社群寫入只經 functions/api/songs/submissions.js（service_role，前面有 guardSubmission）→ community_save_song_video；
-- 片段以公開 code 對回 id，所以既有片段的 code、分享連結、播放次數都保住。
-- 舊的 approve_song_submission 不再使用，暫留（下一輪清）。
--
-- 回滾：
--   drop function if exists public.admin_revert_song_edit(uuid);
--   drop function if exists public.community_save_song_video(text, timestamptz, jsonb, jsonb, jsonb);
--   get_song_catalog 退回 20261027014344 的版本（create or replace 那段，少 k）；
--   drop index if exists public.song_submissions_result_created_idx;
--   alter table public.song_submissions drop column if exists before, drop column if exists reverted_at;
--   -- 先確認沒有 applied／reverted 的列（或先刪掉）再收回 CHECK：
--   alter table public.song_submissions drop constraint song_submissions_status_check;
--   alter table public.song_submissions add constraint song_submissions_status_check
--       check (status in ('pending', 'approved', 'rejected'));
--   alter table public.song_videos drop column if exists community_locked;
--   delete from supabase_migrations.schema_migrations where version = '20261028003911';

-- ───────────── 欄位 ─────────────
alter table public.song_videos
    add column community_locked boolean not null default false;

comment on column public.song_videos.community_locked is
  '後台鎖定：為 true 時社群不能修改這場歌回（community_save_song_video 回 video_locked）。';

alter table public.song_submissions drop constraint song_submissions_status_check;
alter table public.song_submissions add constraint song_submissions_status_check
    check (status in ('pending', 'approved', 'rejected', 'applied', 'reverted'));

alter table public.song_submissions
    add column before jsonb,
    add column reverted_at timestamptz;

comment on column public.song_submissions.before is
  '社群修正前的快照 {video:{title,vtuber_id,streamed_at,duration_seconds}, segments:[{id,code,…}]}；新歌回為 null。';

-- 還原時找「同一支影片、這筆之後」的紀錄
create index song_submissions_result_created_idx
    on public.song_submissions (result_video_ref, created_at);

-- ───────────── 社群寫入（單一交易） ─────────────
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
                                        'duration_seconds', v.duration_seconds),
            'segments', coalesce((
                select jsonb_agg(jsonb_build_object(
                           'id', s.id, 'code', s.code, 'start_seconds', s.start_seconds, 'end_seconds', s.end_seconds,
                           'title', s.title, 'original_artist', s.original_artist, 'version_note', s.version_note,
                           'position', s.position)
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
            'status', v.status), v_segs);
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
                'status', 'published'), p_segments);
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
        source_note, submitter_contact, ip_hash, status, before, result_video_ref)
    values (
        v_kind, p_video_id, case when v_kind = 'revision' then v_ref end, p_video->>'title',
        v_vtuber, (p_video->>'streamed_at')::timestamptz, p_segments,
        p_meta->>'source_note', p_meta->>'submitter_contact', p_meta->>'ip_hash', 'applied', v_before, v_ref)
    returning id into v_sub;

    return json_build_object('kind', v_kind, 'video_ref', v_ref, 'rev', v_rev, 'submission_id', v_sub);
end;
$$;

-- ───────────── 後台一鍵還原 ─────────────
-- 還原到這筆修改之前；同一支影片在這筆之後的修改一併標成 reverted。
-- 修正：照快照寫回（仍存在的片段依 id 寫回、code 不變；已被後台刪掉的重新新增；快照之後新增的刪除）。
-- 新歌回：改成草稿，不刪任何資料（code 與播放次數保留）。
create or replace function public.admin_revert_song_edit(p_submission uuid)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    s public.song_submissions;
    v public.song_videos;
    v_segs jsonb;
    v_count integer;
begin
    select * into s from public.song_submissions where id = p_submission for update;
    if not found then
        raise exception 'submission_not_found' using errcode = 'P0002';
    end if;
    if s.status <> 'applied' then
        raise exception 'not_applied' using errcode = 'P0001';
    end if;
    select * into v from public.song_videos where id = s.result_video_ref for update;
    if not found then
        raise exception 'video_not_found' using errcode = 'P0002';
    end if;

    if s.kind = 'new' or s.before is null then
        update public.song_videos set status = 'draft' where id = v.id;
    else
        select coalesce(jsonb_agg(
                   case when exists (select 1 from public.song_segments x
                                     where x.id = (e->>'id')::uuid and x.video_ref = v.id)
                        then e - 'code'
                        else e - 'code' - 'id' end
                   order by (e->>'start_seconds')::integer), '[]'::jsonb)
        into v_segs
        from jsonb_array_elements(s.before->'segments') e;

        perform public._save_song_video(v.id, jsonb_build_object(
            'video_id', v.video_id,
            'title', s.before->'video'->>'title',
            'vtuber_id', s.before->'video'->>'vtuber_id',
            'streamed_at', s.before->'video'->>'streamed_at',
            'duration_seconds', s.before->'video'->>'duration_seconds',
            'status', v.status), v_segs);
    end if;

    update public.song_submissions
    set status = 'reverted', reverted_at = now()
    where status = 'applied' and result_video_ref = v.id and created_at >= s.created_at;
    get diagnostics v_count = row_count;

    return json_build_object('video_ref', v.id, 'kind', s.kind, 'reverted', v_count);
end;
$$;

-- ───────────── 公開目錄：多一個 k（single／stream） ─────────────
--   以 20261027014344 的版本為基礎；k 的規則與前端 isSingleSongVideo 一致（≤ 600 秒且只有一段）。
create or replace function public.get_song_catalog()
returns json
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(json_agg(r.item order by r.grp, r.streamed_at desc nulls last, r.video_id), '[]'::json)
    from (
        select 0 as grp, v.video_id, v.streamed_at,
               json_build_object(
                   'v', v.video_id,
                   't', v.title,
                   'd', v.streamed_at,
                   'k', case when v.duration_seconds is not null and v.duration_seconds <= 600
                                  and (select count(*) from public.song_segments c where c.video_ref = v.id) = 1
                             then 'single' else 'stream' end,
                   'vt', case when vt.id is null then null
                              else json_build_object('i', vt.id, 'n', vt.name, 'img', vt.img_url) end,
                   's', coalesce((
                       select json_agg(json_build_array(s.code, s.start_seconds, s.end_seconds, s.title, s.original_artist,
                                                        coalesce(pc.plays, 0), s.song_id, s.version_note)
                                       order by s.start_seconds)
                       from public.song_segments s
                       left join public.song_play_counts pc on pc.code = s.code
                       where s.video_ref = v.id
                   ), '[]'::json)
               ) as item
        from public.song_videos v
        left join public.vtubers vt on vt.id = v.vtuber_id
        where v.status = 'published'
        union all
        select 1, null, null,
               json_build_object('songs', coalesce((
                   select json_agg(json_build_array(so.id, so.title, so.original_artist) order by so.id)
                   from public.songs so
                   where exists (
                       select 1 from public.song_segments s
                       join public.song_videos v on v.id = s.video_ref and v.status = 'published'
                       where s.song_id = so.id)
               ), '[]'::json))
    ) r;
$$;

-- ───────────── 權限 ─────────────
revoke all on function public.community_save_song_video(text, timestamptz, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_revert_song_edit(uuid) from public, anon, authenticated;
revoke all on function public.get_song_catalog() from public, anon, authenticated;
grant execute on function public.community_save_song_video(text, timestamptz, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.admin_revert_song_edit(uuid) to service_role;
grant execute on function public.get_song_catalog() to service_role;
