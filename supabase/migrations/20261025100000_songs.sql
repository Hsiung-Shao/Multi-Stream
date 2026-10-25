-- VTuber 歌曲播放清單 v1：歌回影片＋歌曲片段（時間軸）
--
-- 使用者裁定（2026-10-25）：
--   - 管理員在後台手動建時間軸（functions/api/admin/songs.js 以 service_role 寫入）；v1 不開放社群投稿。
--   - 分享連結用片段短 ID（song_segments.code），所以 code 一旦產生就不可變；後台編輯片段要依 id 原地更新。
--
-- code 產生器的字元集必須是 CHECK 的子集（memory error_server_id_alphabet_vs_check），
-- 所以只在資料庫產生（gen_song_code，[0-9a-z]），Function 端不產 ID。
--
-- 回滾：
--   drop function if exists public.admin_save_song_video(uuid, jsonb, jsonb);
--   drop function if exists public.get_song_catalog();
--   drop table if exists public.song_segments;
--   drop table if exists public.song_videos;
--   drop function if exists public.gen_song_code();

-- ───────────── 短 ID 產生器 ─────────────
create or replace function public.gen_song_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
    alphabet constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
    bytes bytea := extensions.gen_random_bytes(8);
    result text := '';
begin
    for i in 0..7 loop
        result := result || substr(alphabet, (get_byte(bytes, i) % 36) + 1, 1);
    end loop;
    return result;
end;
$$;

-- ───────────── 歌回影片 ─────────────
create table public.song_videos (
    id               uuid primary key default gen_random_uuid(),
    video_id         text not null unique check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
    vtuber_id        uuid references public.vtubers(id) on delete set null,
    title            text not null check (char_length(title) between 1 and 200),
    streamed_at      timestamptz,
    duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
    status           text not null default 'draft' check (status in ('draft', 'published')),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.song_videos is
  '歌回影片（YouTube）。public 只可看 published；寫入只經 functions/api/admin/songs.js（service_role）。';

create index song_videos_published_idx
    on public.song_videos (status, streamed_at desc);

create trigger song_videos_touch_updated_at
    before update on public.song_videos
    for each row execute function public.touch_updated_at();

-- ───────────── 歌曲片段 ─────────────
create table public.song_segments (
    id              uuid primary key default gen_random_uuid(),
    code            text not null unique default public.gen_song_code() check (code ~ '^[0-9a-z]{8}$'),
    video_ref       uuid not null references public.song_videos(id) on delete cascade,
    start_seconds   integer not null check (start_seconds >= 0),
    end_seconds     integer not null,
    title           text not null check (char_length(title) between 1 and 200),
    original_artist text check (original_artist is null or char_length(original_artist) between 1 and 200),
    position        smallint not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    check (end_seconds > start_seconds)
);

comment on table public.song_segments is
  '歌回裡的一首歌（起訖秒數）。code 是分享連結用的短 ID，產生後不可變；片段不重疊由寫入端驗證。';

create index song_segments_video_idx
    on public.song_segments (video_ref, start_seconds);

create trigger song_segments_touch_updated_at
    before update on public.song_segments
    for each row execute function public.touch_updated_at();

-- ───────────── RLS ─────────────
alter table public.song_videos enable row level security;
alter table public.song_segments enable row level security;

create policy "song_videos_public_select_published"
    on public.song_videos
    for select
    to anon, authenticated
    using (status = 'published');

create policy "song_segments_public_select_published"
    on public.song_segments
    for select
    to anon, authenticated
    using (exists (
        select 1 from public.song_videos v
        where v.id = song_segments.video_ref and v.status = 'published'
    ));

create policy "song_videos_admin_write"
    on public.song_videos
    as permissive
    for all
    to authenticated
    using (public.is_admin() and public.auth_is_aal2())
    with check (public.is_admin() and public.auth_is_aal2());

create policy "song_segments_admin_write"
    on public.song_segments
    as permissive
    for all
    to authenticated
    using (public.is_admin() and public.auth_is_aal2())
    with check (public.is_admin() and public.auth_is_aal2());

-- ───────────── 公開目錄 ─────────────
-- 一次回傳全部已發布歌回（短 key 省流量）：
--   [{v: videoId, t: 標題, d: 開台時間, vt: {i: vtuber_id, n: 名稱, img: 頭像} | null,
--     s: [[code, start, end, 歌名, 原唱|null], ...]}]
-- 只給 service_role：一律經 functions/api/songs/catalog.js（edge 快取），不開放 anon 直打繞過快取。
create or replace function public.get_song_catalog()
returns json
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(json_agg(r.item order by r.streamed_at desc nulls last, r.video_id), '[]'::json)
    from (
        select v.video_id, v.streamed_at,
               json_build_object(
                   'v', v.video_id,
                   't', v.title,
                   'd', v.streamed_at,
                   'vt', case when vt.id is null then null
                              else json_build_object('i', vt.id, 'n', vt.name, 'img', vt.img_url) end,
                   's', coalesce((
                       select json_agg(json_build_array(s.code, s.start_seconds, s.end_seconds, s.title, s.original_artist)
                                       order by s.start_seconds)
                       from public.song_segments s
                       where s.video_ref = v.id
                   ), '[]'::json)
               ) as item
        from public.song_videos v
        left join public.vtubers vt on vt.id = v.vtuber_id
        where v.status = 'published'
    ) r;
$$;

-- ───────────── 後台寫入（單一交易） ─────────────
-- functions/api/admin/songs.js 的 POST／PUT 只打這一支：一次 subrequest 完成整支歌回
-- （逐筆打 PostgREST 在長歌回會超過 Cloudflare 每次請求的 subrequest 上限，且中途失敗會留下半套）。
--   p_id 為 null → 新增影片；否則先檢查（影片存在、帶 id 的片段都屬於這支影片）才開始寫。
--   片段：帶 id 的依 id 原地更新（保住 code，只改有變的列）、不帶 id 的新增、DB 有但沒傳的刪除。
--   p_video、p_segments 已由 functions/lib/songs.js 驗證；這裡的 CHECK 是最後防線。
-- 錯誤：unknown_segment_id（P0001）、video_not_found（P0002）、video_id 重複（23505）。
create or replace function public.admin_save_song_video(p_id uuid, p_video jsonb, p_segments jsonb)
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

revoke all on function public.get_song_catalog() from public, anon, authenticated;
revoke all on function public.admin_save_song_video(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.get_song_catalog() to service_role;
grant execute on function public.admin_save_song_video(uuid, jsonb, jsonb) to service_role;
