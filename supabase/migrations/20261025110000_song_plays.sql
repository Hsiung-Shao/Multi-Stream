-- 歌回播放清單 v1.1：全站播放次數
--
-- 使用者裁定（2026-10-25）：全站公開次數；聽滿 30 秒或片段一半（取較短者）才算一次（前端判斷）。
-- 寫入只經 functions/api/songs/plays.js（service_role）→ record_song_plays：一個請求一次 RPC。
-- 限流放 DB 不用 KV：KV 每日寫入有額度上限，每次播放都寫會很快用完。
--   每個雜湊 IP 每小時最多 120 首；一批最多 20 首；只計已發布歌回的 code。
--   同一個雜湊 IP、同一首歌、同一小時只算 1 次（伺服器端去重；前端 30 分鐘去重只是省請求，可被繞過）。
--   額度檢查與累加是同一條 upsert（衝突列被鎖住），併發請求不能一起繞過上限。
--
-- 回滾：
--   drop function if exists public.record_song_plays(text, text[]);
--   drop table if exists public.song_play_seen;
--   drop table if exists public.song_play_rate;
--   drop table if exists public.song_play_counts;
--   （get_song_catalog 退回 20261025100000 的版本：s 陣列少第 6 欄）

create table public.song_play_counts (
    code       text primary key references public.song_segments(code) on delete cascade on update cascade,
    plays      bigint not null default 0 check (plays >= 0),
    updated_at timestamptz not null default now()
);

comment on table public.song_play_counts is
  '每首歌（片段 code）的全站播放次數。只由 record_song_plays 寫入；公開讀取經 get_song_catalog。';

create table public.song_play_rate (
    ip_hash      text not null check (char_length(ip_hash) between 16 and 128),
    window_start timestamptz not null,
    n            integer not null default 0 check (n >= 0),
    primary key (ip_hash, window_start)
);

comment on table public.song_play_rate is
  '播放計次的每小時額度桶（雜湊 IP，不存明文）。record_song_plays 偶爾順手清掉 2 小時前的桶。';

create index song_play_rate_window_idx on public.song_play_rate (window_start);

create table public.song_play_seen (
    ip_hash      text not null check (char_length(ip_hash) between 16 and 128),
    code         text not null,
    window_start timestamptz not null,
    primary key (ip_hash, code, window_start)
);

comment on table public.song_play_seen is
  '同一雜湊 IP 同一首歌每小時只計一次的去重紀錄。record_song_plays 偶爾順手清掉 2 小時前的列。';

create index song_play_seen_window_idx on public.song_play_seen (window_start);

alter table public.song_play_counts enable row level security;
alter table public.song_play_rate enable row level security;
alter table public.song_play_seen enable row level security;
revoke all on table public.song_play_counts from anon, authenticated;
revoke all on table public.song_play_rate from anon, authenticated;
revoke all on table public.song_play_seen from anon, authenticated;

-- ───────────── 記錄播放 ─────────────
create or replace function public.record_song_plays(p_ip_hash text, p_codes text[])
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_codes text[];
    v_window timestamptz := date_trunc('hour', now());
    v_n integer;
    v_counted integer;
begin
    select coalesce(array_agg(distinct c), '{}'::text[]) into v_codes
    from unnest(coalesce(p_codes, '{}'::text[])) as c
    where c ~ '^[0-9a-z]{8}$';

    v_n := coalesce(array_length(v_codes, 1), 0);
    if v_n = 0 then
        return json_build_object('ok', true, 'counted', 0);
    end if;
    if v_n > 20 then
        return json_build_object('ok', false, 'reason', 'too_many');
    end if;

    -- 額度：檢查與累加同一條語句；超過上限時 do update 的 where 不成立 → 沒有回傳列
    insert into public.song_play_rate as r (ip_hash, window_start, n)
    values (p_ip_hash, v_window, v_n)
    on conflict (ip_hash, window_start) do update set n = r.n + excluded.n
        where r.n + excluded.n <= 120;
    if not found then
        return json_build_object('ok', false, 'reason', 'rate_limited');
    end if;

    -- 同 IP 同首同小時只計一次：只有這次新插入去重紀錄的 code 才累加
    with fresh as (
        insert into public.song_play_seen (ip_hash, code, window_start)
        select p_ip_hash, s.code, v_window
        from public.song_segments s
        join public.song_videos v on v.id = s.video_ref and v.status = 'published'
        where s.code = any (v_codes)
        on conflict do nothing
        returning code
    )
    insert into public.song_play_counts as pc (code, plays, updated_at)
    select code, 1, now() from fresh
    on conflict (code) do update set plays = pc.plays + 1, updated_at = now();
    get diagnostics v_counted = row_count;

    -- 清理舊資料不必每次做（約 2% 的請求順手清）
    if random() < 0.02 then
        delete from public.song_play_rate where window_start < v_window - interval '2 hours';
        delete from public.song_play_seen where window_start < v_window - interval '2 hours';
    end if;

    return json_build_object('ok', true, 'counted', v_counted);
end;
$$;

revoke all on function public.record_song_plays(text, text[]) from public, anon, authenticated;
grant execute on function public.record_song_plays(text, text[]) to service_role;

-- ───────────── 公開目錄加播放次數（s 陣列第 6 欄） ─────────────
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
                       select json_agg(json_build_array(s.code, s.start_seconds, s.end_seconds, s.title, s.original_artist,
                                                        coalesce(pc.plays, 0))
                                       order by s.start_seconds)
                       from public.song_segments s
                       left join public.song_play_counts pc on pc.code = s.code
                       where s.video_ref = v.id
                   ), '[]'::json)
               ) as item
        from public.song_videos v
        left join public.vtubers vt on vt.id = v.vtuber_id
        where v.status = 'published'
    ) r;
$$;

revoke all on function public.get_song_catalog() from public, anon, authenticated;
grant execute on function public.get_song_catalog() to service_role;
