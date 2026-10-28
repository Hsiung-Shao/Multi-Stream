-- 歌曲長度：時間軸「沒寫結束」的列，依歌曲長度估計結束（站內人工確認長度優先，其次 iTunes 原曲長度快取）。
--
-- 1. song_segments.end_estimated：結束時間是估計值（前端早就送 endEstimated，這裡起才存下來）。
--    既有片段一律 false（現有資料都是後台人工輸入）。站內長度只取 false 的片段。
-- 2. _save_song_video：片段可帶 end_estimated，寫法同 version_note（有帶 key 就寫、更新時沒帶就保留、新增時沒帶＝false）。
--    以 20261027014344 的版本為底，只多這一欄。
-- 3. song_length_refs：iTunes 查詢結果快取（含查無）。鍵用 song_norm_text，與 song_keys 同一套規則。
-- 3b. community_save_song_video：社群修正快照多存 end_estimated（後台還原一併寫回）。song_length_refs_put：查無不蓋掉 180 天內的查到值。
-- 4. song_ref_lengths（讀）／song_length_refs_put（寫）：只給 service_role（/api/songs/lengths 使用）。
--
-- 只新增欄位、表、函式；不改動既有資料列。
--
-- 回滾：
--   drop function if exists public.song_length_refs_put(jsonb);
--   drop function if exists public.song_ref_lengths(jsonb);
--   drop table if exists public.song_length_refs;
--   -- 重新執行 20261027014344 中 _save_song_video 的定義（不含 end_estimated）後：
--   alter table public.song_segments drop column if exists end_estimated;
--   delete from supabase_migrations.schema_migrations where version = '20261028200000';

-- ───────────── 片段旗標 ─────────────
alter table public.song_segments
    add column if not exists end_estimated boolean not null default false;

comment on column public.song_segments.end_estimated is
  '結束時間是估計值（時間軸沒寫結束，由下一首開始／歌曲長度／4:30 上限推得）。false＝人工確認，才會被當成站內歌曲長度。';

-- ───────────── 存檔本體：多讀寫 end_estimated ─────────────
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
            position = (e->>'position')::smallint,
            version_note = case when e ? 'version_note' then e->>'version_note' else s.version_note end,
            end_estimated = case when e ? 'end_estimated' then coalesce((e->>'end_estimated')::boolean, false)
                                 else s.end_estimated end
        from jsonb_array_elements(p_segments) e
        where e->>'id' is not null
          and s.id = (e->>'id')::uuid
          and (s.start_seconds, s.end_seconds, s.title, s.original_artist, s.position, s.version_note, s.end_estimated)
              is distinct from ((e->>'start_seconds')::integer, (e->>'end_seconds')::integer, e->>'title',
                                e->>'original_artist', (e->>'position')::smallint,
                                case when e ? 'version_note' then e->>'version_note' else s.version_note end,
                                case when e ? 'end_estimated' then coalesce((e->>'end_estimated')::boolean, false)
                                     else s.end_estimated end);
    end if;

    -- 新片段：code 由 default 產生，撞號（極少見）就重抽，最多 5 次；song_id 由 trigger 配對
    for v_seg in select e from jsonb_array_elements(p_segments) e where e->>'id' is null loop
        for attempt in 1..5 loop
            begin
                insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position,
                                                  version_note, end_estimated)
                values (v_id, (v_seg->>'start_seconds')::integer, (v_seg->>'end_seconds')::integer,
                        v_seg->>'title', v_seg->>'original_artist', (v_seg->>'position')::smallint,
                        v_seg->>'version_note', coalesce((v_seg->>'end_estimated')::boolean, false));
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
                       'title', s.title, 'original_artist', s.original_artist, 'position', s.position,
                       'song_id', s.song_id, 'version_note', s.version_note, 'end_estimated', s.end_estimated,
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

-- ───────────── iTunes 快取 ─────────────
create table if not exists public.song_length_refs (
    title_key  text not null check (char_length(title_key) >= 1),
    artist_key text not null check (char_length(artist_key) >= 1),
    seconds    integer check (seconds is null or seconds between 30 and 1200),
    matched    text check (matched is null or char_length(matched) <= 500),
    country    text check (country is null or country ~ '^[A-Z]{2}$'),
    fetched_at timestamptz not null default now(),
    primary key (title_key, artist_key)
);

comment on table public.song_length_refs is
  'iTunes 原曲長度快取（seconds null＝查無）。只由 song_length_refs_put 寫入；查到的 180 天、查無的 30 天後重查。';

alter table public.song_length_refs enable row level security;
revoke all on table public.song_length_refs from anon, authenticated;

-- ───────────── 讀：每首歌的長度與來源 ─────────────
-- 輸入 [{title, artist}]，回同順序 [{seconds, source}]：
--   site     同一首歌（song_keys）人工確認片段（end_estimated=false、無版本備註、30～900 秒）的長度中位數
--   itunes   快取查到且 180 天內
--   miss     快取查無且 30 天內；或沒有原唱（不查外部）
--   unknown  需要查 iTunes（有原唱、沒有可用快取）
create or replace function public.song_ref_lengths(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_out jsonb := '[]'::jsonb;
    v_item jsonb;
    v_tk text;
    v_ak text;
    v_site numeric;
    v_ref record;
begin
    if jsonb_typeof(p_items) is distinct from 'array' then
        raise exception 'invalid_items' using errcode = 'P0001';
    end if;

    for v_item in select e from jsonb_array_elements(p_items) e loop
        v_tk := public.song_norm_text(v_item->>'title');
        v_ak := coalesce(public.song_norm_text(nullif(btrim(v_item->>'artist'), '')), '');

        select percentile_cont(0.5) within group (order by s.end_seconds - s.start_seconds)
        into v_site
        from public.song_keys k
        join public.song_segments s on s.song_id = k.song_id
        where k.title_key = v_tk and k.artist_key = v_ak
          and not s.end_estimated
          and s.version_note is null
          and s.end_seconds is not null
          and s.end_seconds - s.start_seconds between 30 and 900;

        if v_site is not null then
            v_out := v_out || jsonb_build_array(jsonb_build_object('seconds', round(v_site)::integer, 'source', 'site'));
            continue;
        end if;

        if v_ak = '' then
            v_out := v_out || jsonb_build_array(jsonb_build_object('seconds', null, 'source', 'miss'));
            continue;
        end if;

        select r.seconds, r.fetched_at into v_ref
        from public.song_length_refs r
        where r.title_key = v_tk and r.artist_key = v_ak;

        if found and v_ref.seconds is not null and v_ref.fetched_at > now() - interval '180 days' then
            v_out := v_out || jsonb_build_array(jsonb_build_object('seconds', v_ref.seconds, 'source', 'itunes'));
        elsif found and v_ref.seconds is null and v_ref.fetched_at > now() - interval '30 days' then
            v_out := v_out || jsonb_build_array(jsonb_build_object('seconds', null, 'source', 'miss'));
        else
            v_out := v_out || jsonb_build_array(jsonb_build_object('seconds', null, 'source', 'unknown'));
        end if;
    end loop;

    return v_out;
end;
$$;

-- ───────────── 寫：存 iTunes 查詢結果 ─────────────
-- 輸入 [{title, artist, seconds|null, matched, country}]；沒有原唱的列忽略（不查外部，也不該有快取）。
create or replace function public.song_length_refs_put(p_rows jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    if jsonb_typeof(p_rows) is distinct from 'array' then
        raise exception 'invalid_rows' using errcode = 'P0001';
    end if;

    insert into public.song_length_refs (title_key, artist_key, seconds, matched, country, fetched_at)
    select distinct on (x.tk, x.ak) x.tk, x.ak, x.seconds, x.matched, x.country, now()
    from (
        select public.song_norm_text(e->>'title') as tk,
               coalesce(public.song_norm_text(nullif(btrim(e->>'artist'), '')), '') as ak,
               (e->>'seconds')::integer as seconds,
               left(e->>'matched', 500) as matched,
               e->>'country' as country
        from jsonb_array_elements(p_rows) e
    ) x
    where x.tk is not null and x.tk <> '' and x.ak <> ''
    on conflict (title_key, artist_key) do update
    set seconds = excluded.seconds,
        matched = excluded.matched,
        country = excluded.country,
        fetched_at = excluded.fetched_at
    -- 查無不可蓋掉還在有效期內的查到結果（歌名寫法不同造成的一次誤查無，不該讓好資料作廢）；查到的可以蓋掉查無
    where excluded.seconds is not null
       or public.song_length_refs.seconds is null
       or public.song_length_refs.fetched_at <= now() - interval '180 days';
end;
$$;

-- ───────────── 社群修正：快照多存 end_estimated ─────────────
-- 以 20261028003911 的版本逐字複製，只改 v_before.segments 多存 end_estimated，
-- 後台還原（admin_revert_song_edit 把快照片段交給 _save_song_video）才能把估計旗標一併寫回。
-- 舊快照沒有這個 key 時，還原維持現值。
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
                           'position', s.position, 'end_estimated', s.end_estimated)
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

-- ───────────── 權限 ─────────────
revoke all on function public._save_song_video(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public._save_song_video(uuid, jsonb, jsonb) to service_role;
revoke all on function public.song_ref_lengths(jsonb) from public, anon, authenticated;
revoke all on function public.song_length_refs_put(jsonb) from public, anon, authenticated;
grant execute on function public.song_ref_lengths(jsonb) to service_role;
grant execute on function public.song_length_refs_put(jsonb) to service_role;
revoke all on function public.community_save_song_video(text, timestamptz, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.community_save_song_video(text, timestamptz, jsonb, jsonb, jsonb) to service_role;
