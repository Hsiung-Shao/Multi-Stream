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
-- 只含 published，所以 anon 可呼叫；functions/api/songs/catalog.js 另做 edge 快取。
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

revoke all on function public.get_song_catalog() from public;
grant execute on function public.get_song_catalog() to anon, authenticated, service_role;
