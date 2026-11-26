-- 資安稽核 2026-11-27 D 組 #14：匿名修改歌回不能抹掉管理員的拆開／合併
--
-- 問題：社群修改片段標題 → trigger 依鍵重配 song_id → 舊歌沒片段時在 commit 被 GC，
--       拆開的歌（沒有鍵）與合併的別名鍵（cascade）一起消失；一鍵還原也只能依鍵重配，救不回來。
-- 修正（三支函式整支重建，其餘邏輯與 20261027014344／20261106073006 相同）：
--   1. _song_segments_gc：鍵數 ≠ 1 的歌（管理員整理過）不刪
--   2. community_save_song_video：修改前快照多記每個片段的 song_id
--   3. admin_revert_song_edit：還原後照快照把 song_id 寫回（trigger 遇到明確指定的 song_id 會照用）
--
-- 回滾：重新執行 20261027014344 的 _song_segments_gc 與 20261106073006 的另外兩支函式定義
--       （舊快照沒有 song_id 時第 3 點本來就會略過，回滾不影響既有資料）

create or replace function public._song_segments_gc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if old.song_id is not null then
        perform 1 from public.songs s where s.id = old.song_id for update;
        if found then
            -- 管理員整理過的歌不刪：拆開的沒有鍵（0 個）、合併的有別名（≥2 個）；一般歌恰好 1 個鍵
            delete from public.songs s
            where s.id = old.song_id
              and not exists (select 1 from public.song_segments g where g.song_id = old.song_id)
              and (select count(*) from public.song_keys k where k.song_id = old.song_id) = 1;
        end if;
    end if;
    return null;
end;
$$;

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

        -- 片段改回原標題時 trigger 會依鍵重配，管理員的拆開／合併就丟了：照快照把歸屬寫回（歌還在才寫）
        update public.song_segments x
        set song_id = (e->>'song_id')::bigint
        from jsonb_array_elements(s.before->'segments') e
        where e ? 'song_id'
          and x.id = (e->>'id')::uuid
          and x.video_ref = v.id
          and x.song_id is distinct from (e->>'song_id')::bigint
          and exists (select 1 from public.songs so where so.id = (e->>'song_id')::bigint);
    end if;

    update public.song_submissions
    set status = 'reverted', reverted_at = now()
    where status = 'applied' and result_video_ref = v.id and created_at >= s.created_at;
    get diagnostics v_count = row_count;

    return json_build_object('video_ref', v.id, 'kind', s.kind, 'reverted', v_count);
end;
$$;
