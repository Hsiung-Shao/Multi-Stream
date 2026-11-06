-- 歌回：片段合唱成員＋影片剪輯來源
--
-- 使用者裁定（2026-11-06）：
--   - 合唱掛在片段（歌回存檔中間的合唱段也能標）；站內 VTuber 連 id、站外的人存名字；被合唱者的個人頁看得到「參與合唱」。
--   - 觀眾剪輯一定要標剪輯來源（剪輯者頻道名＋連結）；連結只收 youtube.com 的 @handle 或 /channel/UC…；null＝本人上傳。
--   - 社群投稿頁可編輯這兩項（免審核、可還原），所以 before 快照與一鍵還原都要帶上。
-- 寫入語意沿用 version_note：jsonb 沒帶 key＝保留原值（舊呼叫端不受影響）；帶 null／[]＝清除。
-- 目錄：影片多 cs {n,u}（沒有剪輯來源就不輸出）；片段陣列第 9 欄 performers [[vtuber_id|null, name]]（站內者取 vtubers.name 即時值）。
--
-- 回滾：
--   get_song_catalog、community_save_song_video、admin_revert_song_edit 退回 20261028003911 的版本；
--   _save_song_video 退回 20261027014344 的版本；
--   drop trigger if exists vtubers_clear_song_performers on public.vtubers;
--   drop function if exists public._vtubers_clear_song_performers();
--   drop table if exists public.song_segment_performers;
--   alter table public.song_submissions drop column if exists clip;
--   alter table public.song_videos drop constraint if exists song_videos_clip_pair_check,
--       drop constraint if exists song_videos_clip_url_check, drop constraint if exists song_videos_clip_name_check,
--       drop column if exists clip_channel_name, drop column if exists clip_channel_url;
--   delete from supabase_migrations.schema_migrations where version = '20261106100000';

-- ───────────── 剪輯來源 ─────────────
alter table public.song_videos
    add column clip_channel_name text,
    add column clip_channel_url text,
    add constraint song_videos_clip_pair_check
        check ((clip_channel_name is null) = (clip_channel_url is null)),
    add constraint song_videos_clip_name_check
        check (clip_channel_name is null or char_length(btrim(clip_channel_name)) between 1 and 100),
    add constraint song_videos_clip_url_check
        check (clip_channel_url is null
               or (clip_channel_url ~ '^https://(www\.|m\.)?youtube\.com/(@[^/?#[:space:]%\\]{1,100}|channel/UC[0-9A-Za-z_-]{22})$'
                   and clip_channel_url !~ '\.\.'
                   and clip_channel_url !~ '[[:cntrl:]]'));

comment on column public.song_videos.clip_channel_name is '觀眾剪輯的上傳頻道名稱；null＝本人上傳（與 clip_channel_url 同有同無）。';
comment on column public.song_videos.clip_channel_url is '觀眾剪輯的上傳頻道網址，只收 youtube.com/@handle（解碼後的原文，不含反斜線、%、..）或 /channel/UC…。';

-- 修改紀錄：這次送出的剪輯來源（後台摘要比對 before.video 用）；null＝這次沒送（沒改）
alter table public.song_submissions add column clip jsonb;
comment on column public.song_submissions.clip is
  '社群這次送出的剪輯來源 {clip_channel_name, clip_channel_url}；null＝沒送（保留原值）。';
comment on column public.song_submissions.before is
  '社群修正前的快照 {video:{title,vtuber_id,streamed_at,duration_seconds,clip_channel_name,clip_channel_url}, segments:[{id,code,…,performers}]}；新歌回為 null。';

-- ───────────── 合唱成員 ─────────────
create table public.song_segment_performers (
    segment_id uuid not null references public.song_segments(id) on delete cascade,
    position   smallint not null check (position between 0 and 9),
    vtuber_id  uuid references public.vtubers(id) on delete set null,
    name       text check (name is null or char_length(btrim(name)) between 1 and 60),
    created_at timestamptz not null default now(),
    primary key (segment_id, position),
    check (vtuber_id is not null or name is not null)
);

create unique index song_segment_performers_vtuber_uniq
    on public.song_segment_performers (segment_id, vtuber_id) where vtuber_id is not null;
create index song_segment_performers_vtuber_idx
    on public.song_segment_performers (vtuber_id) where vtuber_id is not null;

comment on table public.song_segment_performers is
  '片段的其他合唱者（不含影片歸屬的 VTuber）。站內者存 vtuber_id（name 可留快照），站外者只存 name。只經 security definer RPC 讀寫。';

alter table public.song_segment_performers enable row level security;
revoke all on table public.song_segment_performers from anon, authenticated;

-- 刪 VTuber：FK 會把 vtuber_id 設 null；沒有名字快照的列會違反 CHECK，所以先刪掉
create or replace function public._vtubers_clear_song_performers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.song_segment_performers where vtuber_id = old.id and name is null;
    return old;
end;
$$;

create trigger vtubers_clear_song_performers
    before delete on public.vtubers
    for each row execute function public._vtubers_clear_song_performers();

revoke all on function public._vtubers_clear_song_performers() from public, anon, authenticated;

-- 整批替換一個片段的合唱者（p_list 是 [{vtuber_id, name}]；上限 10）
create or replace function public._set_segment_performers(p_segment uuid, p_list jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_owner uuid;
begin
    if p_list is null or jsonb_typeof(p_list) = 'null' then
        p_list := '[]'::jsonb;
    end if;
    if jsonb_typeof(p_list) <> 'array' then
        raise exception 'invalid_performers' using errcode = 'P0001';
    end if;
    if jsonb_array_length(p_list) > 10 then
        raise exception 'too_many_performers' using errcode = 'P0001';
    end if;
    select v.vtuber_id into v_owner
    from public.song_segments s join public.song_videos v on v.id = s.video_ref
    where s.id = p_segment;

    delete from public.song_segment_performers where segment_id = p_segment;
    -- 不存在的 VTuber（被刪、或送來假 id）：有名字快照就當站外者，沒名字就略過；影片本人不算合唱者
    insert into public.song_segment_performers (segment_id, position, vtuber_id, name)
    select p_segment, (row_number() over (order by x.n) - 1)::smallint, x.vid, x.nm
    from (
        select t.n, vt.id as vid, nullif(btrim(t.e->>'name'), '') as nm
        from jsonb_array_elements(p_list) with ordinality as t(e, n)
        left join public.vtubers vt on vt.id = nullif(t.e->>'vtuber_id', '')::uuid
    ) x
    where (x.vid is not null or x.nm is not null)
      and (x.vid is null or v_owner is null or x.vid <> v_owner);
end;
$$;

revoke all on function public._set_segment_performers(uuid, jsonb) from public, anon, authenticated;

-- 片段的合唱者（輸出用）
create or replace function public._segment_performers_json(p_segment uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(jsonb_agg(jsonb_build_object('vtuber_id', p.vtuber_id, 'name', p.name) order by p.position), '[]'::jsonb)
    from public.song_segment_performers p
    where p.segment_id = p_segment;
$$;

revoke all on function public._segment_performers_json(uuid) from public, anon, authenticated;

-- 只取 p_video 中「有帶」的剪輯欄位（沒帶＝保留）
create or replace function public._clip_keys(p_video jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
    select coalesce(jsonb_object_agg(k, p_video->k), '{}'::jsonb)
    from unnest(array['clip_channel_name', 'clip_channel_url']) k
    where p_video ? k;
$$;

revoke all on function public._clip_keys(jsonb) from public, anon, authenticated;

-- ───────────── 存檔本體（以 20261027014344 為基礎） ─────────────
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
    v_new uuid;
begin
    if p_id is null then
        -- 新影片不可能有既有片段；帶 id 的片段若放行會在下面的新增迴圈被略過而遺失
        if exists (select 1 from jsonb_array_elements(p_segments) e where e->>'id' is not null) then
            raise exception 'unknown_segment_id' using errcode = 'P0001';
        end if;
        insert into public.song_videos (video_id, title, vtuber_id, streamed_at, duration_seconds, status,
                                        clip_channel_name, clip_channel_url)
        values (p_video->>'video_id', p_video->>'title', (p_video->>'vtuber_id')::uuid,
                (p_video->>'streamed_at')::timestamptz, (p_video->>'duration_seconds')::integer, p_video->>'status',
                nullif(btrim(p_video->>'clip_channel_name'), ''), nullif(p_video->>'clip_channel_url', ''))
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
            status = p_video->>'status',
            clip_channel_name = case when p_video ? 'clip_channel_name'
                                     then nullif(btrim(p_video->>'clip_channel_name'), '') else clip_channel_name end,
            clip_channel_url = case when p_video ? 'clip_channel_url'
                                    then nullif(p_video->>'clip_channel_url', '') else clip_channel_url end
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
            position = (e->>'position')::smallint,
            version_note = case when e ? 'version_note' then e->>'version_note' else s.version_note end
        from jsonb_array_elements(p_segments) e
        where e->>'id' is not null
          and s.id = (e->>'id')::uuid
          and (s.start_seconds, s.end_seconds, s.title, s.original_artist, s.position, s.version_note)
              is distinct from ((e->>'start_seconds')::integer, (e->>'end_seconds')::integer, e->>'title',
                                e->>'original_artist', (e->>'position')::smallint,
                                case when e ? 'version_note' then e->>'version_note' else s.version_note end);

        -- 既有片段：有帶 performers 才整批替換
        for v_seg in select e from jsonb_array_elements(p_segments) e where e->>'id' is not null and e ? 'performers' loop
            perform public._set_segment_performers((v_seg->>'id')::uuid, v_seg->'performers');
        end loop;
    end if;

    -- 新片段：code 由 default 產生，撞號（極少見）就重抽，最多 5 次；song_id 由 trigger 配對
    for v_seg in select e from jsonb_array_elements(p_segments) e where e->>'id' is null loop
        for attempt in 1..5 loop
            begin
                insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position,
                                                  version_note)
                values (v_id, (v_seg->>'start_seconds')::integer, (v_seg->>'end_seconds')::integer,
                        v_seg->>'title', v_seg->>'original_artist', (v_seg->>'position')::smallint,
                        v_seg->>'version_note')
                returning id into v_new;
                exit;
            exception when unique_violation then
                if attempt = 5 then raise; end if;
            end;
        end loop;
        if v_seg ? 'performers' then
            perform public._set_segment_performers(v_new, v_seg->'performers');
        end if;
    end loop;

    return json_build_object(
        'id', v_id,
        'segments', coalesce((
            select json_agg(json_build_object(
                       'id', s.id, 'code', s.code, 'start_seconds', s.start_seconds, 'end_seconds', s.end_seconds,
                       'title', s.title, 'original_artist', s.original_artist, 'position', s.position,
                       'song_id', s.song_id, 'version_note', s.version_note,
                       'performers', public._segment_performers_json(s.id),
                       'song', json_build_object(
                           'id', so.id, 'title', so.title, 'artist', so.original_artist,
                           'versions', (select count(*) from public.song_segments x where x.song_id = so.id)))
                   order by s.start_seconds)
            from public.song_segments s
            join public.songs so on so.id = s.song_id
            where s.video_ref = v_id
        ), '[]'::json)
    );
end;
$$;

-- ───────────── 社群寫入（以 20261028003911 為基礎；快照多存剪輯來源與合唱者） ─────────────
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
                           'id', s.id, 'code', s.code, 'start_seconds', s.start_seconds, 'end_seconds', s.end_seconds,
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
        source_note, submitter_contact, ip_hash, status, before, result_video_ref, clip)
    values (
        v_kind, p_video_id, case when v_kind = 'revision' then v_ref end, p_video->>'title',
        v_vtuber, (p_video->>'streamed_at')::timestamptz, p_segments,
        p_meta->>'source_note', p_meta->>'submitter_contact', p_meta->>'ip_hash', 'applied', v_before, v_ref,
        nullif(public._clip_keys(p_video), '{}'::jsonb))
    returning id into v_sub;

    return json_build_object('kind', v_kind, 'video_ref', v_ref, 'rev', v_rev, 'submission_id', v_sub);
end;
$$;

-- ───────────── 後台一鍵還原（以 20261028003911 為基礎；剪輯來源與合唱者依快照寫回，舊快照缺 key＝清空） ─────────────
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
                   -- migration 前的快照沒有 performers：當時本來就沒有合唱者，還原＝清空
                   || case when e ? 'performers' then '{}'::jsonb else '{"performers": []}'::jsonb end
                   order by (e->>'start_seconds')::integer), '[]'::jsonb)
        into v_segs
        from jsonb_array_elements(s.before->'segments') e;

        -- 剪輯來源一律依快照寫回；舊快照缺 key 時值為 null＝清除（當時本來就沒有）
        perform public._save_song_video(v.id, jsonb_build_object(
            'video_id', v.video_id,
            'title', s.before->'video'->>'title',
            'vtuber_id', s.before->'video'->>'vtuber_id',
            'streamed_at', s.before->'video'->>'streamed_at',
            'duration_seconds', s.before->'video'->>'duration_seconds',
            'status', v.status,
            'clip_channel_name', s.before->'video'->'clip_channel_name',
            'clip_channel_url', s.before->'video'->'clip_channel_url'), v_segs);
    end if;

    update public.song_submissions
    set status = 'reverted', reverted_at = now()
    where status = 'applied' and result_video_ref = v.id and created_at >= s.created_at;
    get diagnostics v_count = row_count;

    return json_build_object('video_ref', v.id, 'kind', s.kind, 'reverted', v_count);
end;
$$;

-- ───────────── 公開目錄（以 20261028003911 為基礎；多 cs 與片段第 9 欄） ─────────────
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
               (jsonb_build_object(
                   'v', v.video_id,
                   't', v.title,
                   'd', v.streamed_at,
                   'k', case when v.duration_seconds is not null and v.duration_seconds <= 600
                                  and (select count(*) from public.song_segments c where c.video_ref = v.id) = 1
                             then 'single' else 'stream' end,
                   'vt', case when vt.id is null then null
                              else jsonb_build_object('i', vt.id, 'n', vt.name, 'img', vt.img_url) end,
                   's', coalesce((
                       select jsonb_agg(jsonb_build_array(s.code, s.start_seconds, s.end_seconds, s.title, s.original_artist,
                                                          coalesce(pc.plays, 0), s.song_id, s.version_note,
                                                          coalesce((
                                                              select jsonb_agg(jsonb_build_array(p.vtuber_id, coalesce(pv.name, p.name))
                                                                               order by p.position)
                                                              from public.song_segment_performers p
                                                              left join public.vtubers pv on pv.id = p.vtuber_id
                                                              where p.segment_id = s.id), '[]'::jsonb))
                                        order by s.start_seconds)
                       from public.song_segments s
                       left join public.song_play_counts pc on pc.code = s.code
                       where s.video_ref = v.id
                   ), '[]'::jsonb))
                || case when v.clip_channel_name is not null
                        then jsonb_build_object('cs', jsonb_build_object('n', v.clip_channel_name, 'u', v.clip_channel_url))
                        else '{}'::jsonb end
               )::json as item
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

-- ───────────── 權限（create or replace 不會改既有授權；重申一次） ─────────────
revoke all on function public._save_song_video(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.community_save_song_video(text, timestamptz, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_revert_song_edit(uuid) from public, anon, authenticated;
revoke all on function public.get_song_catalog() from public, anon, authenticated;
grant execute on function public.community_save_song_video(text, timestamptz, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.admin_revert_song_edit(uuid) to service_role;
grant execute on function public.get_song_catalog() to service_role;
