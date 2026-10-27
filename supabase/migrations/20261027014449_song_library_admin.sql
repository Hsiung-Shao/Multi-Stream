-- 歌回播放清單 v1.3：後台「歌曲整理」RPC（合併、拆開、改名、配對預覽、搜尋、疑似重複、單曲明細）
--
-- 使用者裁定（2026-10-27）與主對話裁定：
--   - 合併：來源歌的鍵和片段搬到目標歌，名稱與原唱保留目標的；兩邊原唱都有填且鍵不同時，沒帶 allow 旗標就拒絕（artist_mismatch）。
--   - 拆開：把某個版本拆成一首新歌（沿用該版本的歌名與原唱），不加鍵；之後同名新片段仍配到持有鍵的原歌。
--     只剩一個版本時回 already_single。
--   - 改名：改歌名與原唱（第三參數 null＝清空原唱），加上新鍵、舊鍵保留；新鍵已屬於別首歌時回 key_taken。
--   - 配對預覽 admin_match_songs(items)：輸入 [{segment_id?, title, original_artist}]，最多 200 項（超過 too_many_items），
--     回傳同順序的陣列 {status:'existing'|'new'|'similar', song_id, song|null, similar:[...]}，只讀、不建歌。
--       existing＝鍵完全吻合；帶 segment_id 且該片段的鍵沒變時回它目前的歌（含拆開出來、沒有鍵的歌）。
--       similar＝鍵不吻合，但有相同 title_key、artist_key 不同的歌（song_id 為 null）。new＝以上皆非。
--   - 疑似重複＝title_key 相同但屬於不同首歌的組。
--   - 搜尋、疑似重複、單曲明細都回 jsonb；單曲明細含鍵清單與各版本（片段 id、code、VTuber、歌回標題、開台日期、備註）。
-- 全部只給 service_role：一律經 functions/api/admin/song-library.js（gateAdmin），每個請求只打一支 RPC。
-- 錯誤碼：業務錯誤 P0001（same_song、artist_mismatch、already_single、key_taken、too_many_items、invalid_items、invalid_title），
--         找不到 P0002（song_not_found、segment_not_found）。
--
-- 回滾：
--   drop function if exists public.admin_get_song(bigint);
--   drop function if exists public.admin_song_duplicates(integer);
--   drop function if exists public.admin_search_songs(text, integer);
--   drop function if exists public.admin_match_songs(jsonb);
--   drop function if exists public.admin_rename_song(bigint, text, text);
--   drop function if exists public.admin_split_segment(uuid);
--   drop function if exists public.admin_merge_songs(bigint, bigint, boolean);
--   drop function if exists public._song_brief(bigint);
--   delete from supabase_migrations.schema_migrations where version = '20261027014449';

-- ───────────── 共用：歌曲摘要 ─────────────
create or replace function public._song_brief(p_song_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
               'id', so.id, 'title', so.title, 'artist', so.original_artist,
               'versions', (select count(*) from public.song_segments g where g.song_id = so.id))
    from public.songs so
    where so.id = p_song_id;
$$;

-- ───────────── 合併 ─────────────
-- 回傳 moved_segment_ids：Function 端用 logWarn 記下，必要時可依此手動還原。
create or replace function public.admin_merge_songs(p_source bigint, p_target bigint,
                                                    p_allow_artist_mismatch boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_src public.songs;
    v_tgt public.songs;
    v_moved uuid[];
    v_keys integer;
begin
    if p_source is not distinct from p_target then
        raise exception 'same_song' using errcode = 'P0001';
    end if;

    -- 依 id 順序上鎖，兩個方向相反的合併同時進來也不會互鎖
    perform 1 from public.songs where id in (p_source, p_target) order by id for update;
    select * into v_src from public.songs where id = p_source;
    select * into v_tgt from public.songs where id = p_target;
    if v_src.id is null or v_tgt.id is null then
        raise exception 'song_not_found' using errcode = 'P0002';
    end if;

    -- 只有兩邊原唱都有填、而且正規化後不同才算不一致；一邊空白（未填）直接併入目標
    if not coalesce(p_allow_artist_mismatch, false)
       and nullif(btrim(v_src.original_artist), '') is not null
       and nullif(btrim(v_tgt.original_artist), '') is not null
       and public.song_norm_text(v_src.original_artist) <> public.song_norm_text(v_tgt.original_artist) then
        raise exception 'artist_mismatch' using errcode = 'P0001';
    end if;

    update public.song_keys set song_id = p_target where song_id = p_source;
    get diagnostics v_keys = row_count;

    -- song_id 被明確改掉，配對 trigger 會照用、不重配
    with moved as (
        update public.song_segments set song_id = p_target where song_id = p_source returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_moved from moved;

    delete from public.songs where id = p_source;

    return jsonb_build_object(
        'song', public._song_brief(p_target),
        'source_id', p_source,
        'moved_segment_ids', to_jsonb(v_moved),
        'moved_keys', v_keys);
end;
$$;

-- ───────────── 拆開 ─────────────
create or replace function public.admin_split_segment(p_segment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_seg public.song_segments;
    v_new bigint;
begin
    select * into v_seg from public.song_segments where id = p_segment_id for update;
    if v_seg.id is null then
        raise exception 'segment_not_found' using errcode = 'P0002';
    end if;

    perform 1 from public.songs where id = v_seg.song_id for update;
    if (select count(*) from public.song_segments where song_id = v_seg.song_id) <= 1 then
        raise exception 'already_single' using errcode = 'P0001';
    end if;

    insert into public.songs (title, original_artist) values (v_seg.title, v_seg.original_artist)
    returning id into v_new;
    update public.song_segments set song_id = v_new where id = p_segment_id;

    return jsonb_build_object(
        'song', public._song_brief(v_new),
        'from_song', public._song_brief(v_seg.song_id),
        'segment_id', p_segment_id);
end;
$$;

-- ───────────── 改名 ─────────────
create or replace function public.admin_rename_song(p_song_id bigint, p_title text, p_artist text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_title text := btrim(p_title);
    v_artist text := nullif(btrim(p_artist), '');
    v_tk text;
    v_ak text;
    v_owner bigint;
    v_added boolean := false;
begin
    perform 1 from public.songs where id = p_song_id for update;
    if not found then
        raise exception 'song_not_found' using errcode = 'P0002';
    end if;
    if v_title is null or v_title = '' then
        raise exception 'invalid_title' using errcode = 'P0001';
    end if;

    v_tk := public.song_norm_text(v_title);
    v_ak := coalesce(public.song_norm_text(v_artist), '');
    perform pg_advisory_xact_lock(hashtextextended('song_key:' || v_tk || chr(31) || v_ak, 0));

    select song_id into v_owner from public.song_keys where title_key = v_tk and artist_key = v_ak;
    if v_owner is not null and v_owner <> p_song_id then
        raise exception 'key_taken' using errcode = 'P0001';
    end if;

    update public.songs set title = v_title, original_artist = v_artist where id = p_song_id;
    if v_owner is null then
        insert into public.song_keys (title_key, artist_key, song_id) values (v_tk, v_ak, p_song_id);
        v_added := true;
    end if;

    return jsonb_build_object('song', public._song_brief(p_song_id), 'key_added', v_added);
end;
$$;

-- ───────────── 配對預覽（只讀） ─────────────
create or replace function public.admin_match_songs(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_item jsonb;
    v_out jsonb := '[]'::jsonb;
    v_tk text;
    v_ak text;
    v_song bigint;
    v_seg public.song_segments;
    v_similar jsonb;
begin
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception 'invalid_items' using errcode = 'P0001';
    end if;
    if jsonb_array_length(p_items) > 200 then
        raise exception 'too_many_items' using errcode = 'P0001';
    end if;

    for v_item in select e from jsonb_array_elements(p_items) with ordinality as t(e, n) order by n loop
        v_song := null;
        v_similar := '[]'::jsonb;
        v_tk := nullif(public.song_norm_text(btrim(v_item->>'title')), '');
        v_ak := coalesce(public.song_norm_text(nullif(btrim(v_item->>'original_artist'), '')), '');

        if v_tk is null then
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                'status', 'new', 'song_id', null, 'song', null, 'similar', '[]'::jsonb));
            continue;
        end if;

        -- 既有片段、鍵沒變 → 它目前的歌（拆開出來的歌沒有鍵，也要算 existing）
        v_seg := null;
        if jsonb_typeof(v_item->'segment_id') = 'string'
           and v_item->>'segment_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            select * into v_seg from public.song_segments where id = (v_item->>'segment_id')::uuid;
            if v_seg.id is not null
               and public.song_norm_text(v_seg.title) = v_tk
               and coalesce(public.song_norm_text(v_seg.original_artist), '') = v_ak then
                v_song := v_seg.song_id;
            end if;
        end if;

        if v_song is null then
            select song_id into v_song from public.song_keys where title_key = v_tk and artist_key = v_ak;
        end if;

        if v_song is not null then
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                'status', 'existing', 'song_id', v_song, 'song', public._song_brief(v_song), 'similar', '[]'::jsonb));
            continue;
        end if;

        select coalesce(jsonb_agg(public._song_brief(x.song_id) order by x.song_id), '[]'::jsonb) into v_similar
        from (
            select distinct k.song_id from public.song_keys k
            where k.title_key = v_tk and k.artist_key <> v_ak
            order by k.song_id
            limit 10
        ) x;

        v_out := v_out || jsonb_build_array(jsonb_build_object(
            'status', case when jsonb_array_length(v_similar) > 0 then 'similar' else 'new' end,
            'song_id', null, 'song', null, 'similar', v_similar));
    end loop;

    return v_out;
end;
$$;

-- ───────────── 搜尋 ─────────────
-- 歌名或原唱含關鍵字（不分大小寫），或正規化後的鍵含正規化後的關鍵字；空字串＝最新建立的歌。
create or replace function public.admin_search_songs(p_query text, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_q text := btrim(coalesce(p_query, ''));
    v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
    v_like text;
    v_key text;
    v_out jsonb;
begin
    if v_q = '' then
        select coalesce(jsonb_agg(public._song_brief(x.id) order by x.id desc), '[]'::jsonb) into v_out
        from (select id from public.songs order by id desc limit v_limit) x;
        return v_out;
    end if;

    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_key := public.song_norm_text(v_q);
    v_key := '%' || replace(replace(replace(v_key, '\', '\\'), '%', '\%'), '_', '\_') || '%';

    select coalesce(jsonb_agg(public._song_brief(x.id) order by x.exact desc, x.id desc), '[]'::jsonb) into v_out
    from (
        select so.id,
               exists (select 1 from public.song_keys k
                       where k.song_id = so.id and k.title_key = public.song_norm_text(v_q)) as exact
        from public.songs so
        where so.title ilike v_like
           or so.original_artist ilike v_like
           or exists (select 1 from public.song_keys k
                      where k.song_id = so.id and (k.title_key like v_key or k.artist_key like v_key))
        order by exact desc, so.id desc
        limit v_limit
    ) x;
    return v_out;
end;
$$;

-- ───────────── 疑似重複 ─────────────
-- title_key 相同但分屬不同首歌的組，新建的排前面。
create or replace function public.admin_song_duplicates(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(jsonb_agg(jsonb_build_object('title_key', d.title_key, 'songs', d.songs)
                              order by d.newest desc), '[]'::jsonb)
    from (
        select k.title_key,
               max(k.song_id) as newest,
               (select jsonb_agg(public._song_brief(x.song_id) order by x.song_id)
                from (select distinct k2.song_id from public.song_keys k2 where k2.title_key = k.title_key) x) as songs
        from public.song_keys k
        group by k.title_key
        having count(distinct k.song_id) > 1
        order by max(k.song_id) desc
        limit least(greatest(coalesce(p_limit, 50), 1), 500)
    ) d;
$$;

-- ───────────── 單曲明細 ─────────────
create or replace function public.admin_get_song(p_song_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_out jsonb;
begin
    select jsonb_build_object(
               'song', jsonb_build_object(
                   'id', so.id, 'title', so.title, 'artist', so.original_artist,
                   'created_at', so.created_at, 'updated_at', so.updated_at),
               'keys', coalesce((
                   select jsonb_agg(jsonb_build_object('title_key', k.title_key, 'artist_key', k.artist_key)
                                    order by k.created_at, k.title_key, k.artist_key)
                   from public.song_keys k where k.song_id = so.id), '[]'::jsonb),
               'versions', coalesce((
                   select jsonb_agg(jsonb_build_object(
                              'segment_id', g.id, 'code', g.code,
                              'title', g.title, 'original_artist', g.original_artist, 'version_note', g.version_note,
                              'start_seconds', g.start_seconds, 'end_seconds', g.end_seconds,
                              'video', jsonb_build_object(
                                  'id', v.id, 'video_id', v.video_id, 'title', v.title,
                                  'streamed_at', v.streamed_at, 'status', v.status),
                              'vtuber', case when vt.id is null then null
                                             else jsonb_build_object('id', vt.id, 'name', vt.name) end)
                          order by v.streamed_at desc nulls last, g.start_seconds)
                   from public.song_segments g
                   join public.song_videos v on v.id = g.video_ref
                   left join public.vtubers vt on vt.id = v.vtuber_id
                   where g.song_id = so.id), '[]'::jsonb))
    into v_out
    from public.songs so
    where so.id = p_song_id;

    if v_out is null then
        raise exception 'song_not_found' using errcode = 'P0002';
    end if;
    return v_out;
end;
$$;

-- ───────────── 權限 ─────────────
revoke all on function public._song_brief(bigint) from public, anon, authenticated;
revoke all on function public.admin_merge_songs(bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function public.admin_split_segment(uuid) from public, anon, authenticated;
revoke all on function public.admin_rename_song(bigint, text, text) from public, anon, authenticated;
revoke all on function public.admin_match_songs(jsonb) from public, anon, authenticated;
revoke all on function public.admin_search_songs(text, integer) from public, anon, authenticated;
revoke all on function public.admin_song_duplicates(integer) from public, anon, authenticated;
revoke all on function public.admin_get_song(bigint) from public, anon, authenticated;
grant execute on function public.admin_merge_songs(bigint, bigint, boolean) to service_role;
grant execute on function public.admin_split_segment(uuid) to service_role;
grant execute on function public.admin_rename_song(bigint, text, text) to service_role;
grant execute on function public.admin_match_songs(jsonb) to service_role;
grant execute on function public.admin_search_songs(text, integer) to service_role;
grant execute on function public.admin_song_duplicates(integer) to service_role;
grant execute on function public.admin_get_song(bigint) to service_role;
