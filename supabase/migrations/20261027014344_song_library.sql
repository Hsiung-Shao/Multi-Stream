-- 歌回播放清單 v1.3：歌曲本體（songs）、比對鍵（song_keys）、片段自動配對、版本備註
--
-- 使用者裁定（2026-10-27）：
--   - 新增歌曲表 songs；存檔時依正規化後的「歌名＋原唱」自動配對，後台可合併、拆開（見 20261027014449）。
--   - 一首歌可有多組鍵：合併後來源歌的鍵留下當別名，之後同樣寫法的片段自動配到合併後那首。
--   - 片段可填選填的版本備註 version_note（1～30 字或 null），例如練歌版、清唱、合唱。
--   - 正規化規則只在 SQL 實作一份（song_norm_text），TS 端不實作。
--   - 不轉換繁簡（避免中、日文同字不同歌被誤合）；「小幸运」「小幸運」第一次要人工合併一次，之後靠別名鍵自動配對。
--   - 沒有原唱只配沒有原唱：original_artist 為 null 時 artist_key = ''。
--
-- 配對路徑：後台存檔、核准投稿、直接寫表（管理員經 RLS policy）三條路都經過 song_segments 的 BEFORE trigger
-- → _song_for()，所以 _save_song_video 不必加配對邏輯。只有沒指定 song_id、且比對鍵真的改變時才重新配對，
-- 合併或拆開後的結果會被保留。trigger 函式與 _song_for 是 security definer：authenticated 管理員直接寫表時，
-- 不能因為讀不到 songs／song_keys 而失敗。
-- 孤兒歌（沒有任何片段引用）由 deferrable 的 constraint trigger 在 commit 時清掉，鍵隨歌 cascade。
--
-- 回滾（先退 20261027014449，再退本檔；會失去合併、拆開結果與版本備註，所以第 1 步先備份）：
--   -- 1) 備份（放 public 要立刻關掉公開權限）
--   create table public._song_library_backup_20261027 as
--     select g.id as segment_id, g.code, g.song_id, g.version_note, s.title as song_title, s.original_artist as song_artist
--       from public.song_segments g join public.songs s on s.id = g.song_id;
--   create table public._song_keys_backup_20261027 as select * from public.song_keys;
--   alter table public._song_library_backup_20261027 enable row level security;
--   alter table public._song_keys_backup_20261027 enable row level security;
--   revoke all on table public._song_library_backup_20261027 from anon, authenticated;
--   revoke all on table public._song_keys_backup_20261027 from anon, authenticated;
--   -- 2) 先把引用新欄位的函式退回舊版（SQL 函式本體不記依賴，直接 drop 欄位不會報錯但函式會壞）
--   --    重跑 20261027014100 的 _save_song_video、20261027014007 的 get_song_catalog（create or replace 那兩段）
--   -- 3) 拆掉本檔物件
--   drop trigger if exists song_segments_gc_delete on public.song_segments;
--   drop trigger if exists song_segments_gc_update on public.song_segments;
--   drop trigger if exists song_segments_assign_song on public.song_segments;
--   drop function if exists public._song_segments_gc();
--   drop function if exists public._song_segments_assign_song();
--   drop index if exists public.song_segments_song_idx;
--   alter table public.song_segments drop column if exists version_note, drop column if exists song_id;
--   drop function if exists public._song_for(text, text);
--   drop table if exists public.song_keys;
--   drop table if exists public.songs;
--   drop function if exists public.song_norm_text(text);
--   delete from supabase_migrations.schema_migrations where version = '20261027014344';

-- ───────────── 正規化 ─────────────
-- 1. NFKC 後轉小寫（全形→半形、相容字元統一）。
-- 2. 去掉結尾含版本關鍵字的括號，最多 3 組；(feat. …)／(ft. …) 保留。
-- 3. 去掉空白與明列的標點（不用 [:punct:]：它依 ICU／libc locale 而定，不穩）。
-- 4. 結果變空字串就退回去括號前的結果；仍為空（全是標點）就用第 1 步的結果，保證非空。
-- 注意：Postgres 升級 Unicode 版本後 NFKC 結果可能改變，會產生需要人工合併的重複歌。
create or replace function public.song_norm_text(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
    c_punct constant text :=
        '!"#$%&''()*+,-./:;<=>?@[\]^_`{|}~'
        || '、。「」『』【】〈〉《》〔〕〖〗…‥〜‐‑‒–—―‘’“”′″・·•‧★☆♪♫♬♩♡♥❤¡¿';
    v_raw text;
    v text;
    v_inner text;
    v_out text;
begin
    if p is null then
        return null;
    end if;
    v_raw := lower(normalize(p, NFKC));
    v := v_raw;

    for i in 1..3 loop
        v_inner := (regexp_match(v, '[(\[【]([^()\[\]【】]*)[)\]】]\s*$'))[1];
        exit when v_inner is null
               or v_inner ~ '\m(feat|ft)\M'
               or v_inner !~ ('\m(ver|version|cover|acoustic|live|short|full|remix|karaoke|piano|guitar|unplugged|instrumental|arrange)\M'
                              || '|清唱|練歌|练歌|合唱|重唱|歌ってみた|弾き語り|カバー|翻唱|現場|现场');
        v := regexp_replace(v, '\s*[(\[【][^()\[\]【】]*[)\]】]\s*$', '');
    end loop;

    v_out := translate(regexp_replace(v, '\s+', '', 'g'), c_punct, '');
    if v_out = '' then
        v_out := translate(regexp_replace(v_raw, '\s+', '', 'g'), c_punct, '');
    end if;
    if v_out = '' then
        v_out := coalesce(nullif(btrim(v_raw), ''), v_raw);
    end if;
    return v_out;
end;
$$;

comment on function public.song_norm_text(text) is
  '歌名／原唱的比對鍵正規化（NFKC、小寫、去結尾版本括號、去空白標點）。規則只有這一份，TS 端不實作。';

-- ───────────── 歌曲本體 ─────────────
create table public.songs (
    id              bigint generated always as identity primary key,
    title           text not null check (char_length(title) between 1 and 200),
    original_artist text check (original_artist is null or char_length(original_artist) between 1 and 200),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.songs is
  '歌曲本體（同一首歌的所有版本＝引用它的 song_segments）。只由 security definer 函式寫入；公開讀取經 get_song_catalog。';

create trigger songs_touch_updated_at
    before update on public.songs
    for each row execute function public.touch_updated_at();

create table public.song_keys (
    title_key  text not null check (char_length(title_key) >= 1),
    artist_key text not null,
    song_id    bigint not null references public.songs(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (title_key, artist_key)
);

comment on table public.song_keys is
  '比對鍵 → 歌曲。一首歌可有多組鍵（合併後的別名、改名前的舊名）。artist_key = '''' 代表沒有原唱。';

create index song_keys_song_idx on public.song_keys (song_id);

alter table public.songs enable row level security;
alter table public.song_keys enable row level security;
revoke all on table public.songs from anon, authenticated;
revoke all on table public.song_keys from anon, authenticated;

-- ───────────── 片段新增欄位 ─────────────
alter table public.song_segments
    add column song_id bigint references public.songs(id) on delete restrict,
    add column version_note text check (version_note is null or char_length(version_note) between 1 and 30);

create index song_segments_song_idx on public.song_segments (song_id);

-- ───────────── 鍵 → 歌（查不到就建） ─────────────
-- advisory lock 以鍵為單位，兩個交易同時寫同一首新歌時只會建一首。
create or replace function public._song_for(p_title text, p_artist text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_tk text := public.song_norm_text(p_title);
    v_ak text := coalesce(public.song_norm_text(p_artist), '');
    v_id bigint;
begin
    if v_tk is null or v_tk = '' then
        raise exception 'invalid_title' using errcode = 'P0001';
    end if;

    select k.song_id into v_id from public.song_keys k where k.title_key = v_tk and k.artist_key = v_ak;
    if found then
        return v_id;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('song_key:' || v_tk || chr(31) || v_ak, 0));
    -- READ COMMITTED：拿到鎖後這條查詢取新快照，看得到剛 commit 的那一首
    select k.song_id into v_id from public.song_keys k where k.title_key = v_tk and k.artist_key = v_ak;
    if found then
        return v_id;
    end if;

    insert into public.songs (title, original_artist) values (p_title, p_artist) returning id into v_id;
    insert into public.song_keys (title_key, artist_key, song_id) values (v_tk, v_ak, v_id);
    return v_id;
end;
$$;

-- ───────────── 回填既有片段 ─────────────
-- 依鍵分組，每組取最早寫入的那段建歌與鍵；歌的 id 依最早寫入時間排序。
-- 回填在建配對 trigger 之前做；暫停 touch trigger，不讓 updated_at 被回填改動。
alter table public.song_segments disable trigger song_segments_touch_updated_at;

do $$
declare
    r record;
    v_id bigint;
begin
    for r in
        select g.tk, g.ak, g.title, g.original_artist, g.created_at
        from (
            select distinct on (x.tk, x.ak) x.tk, x.ak, x.title, x.original_artist, x.created_at, x.id
            from (
                select s.id, s.title, s.original_artist, s.created_at,
                       public.song_norm_text(s.title) as tk,
                       coalesce(public.song_norm_text(s.original_artist), '') as ak
                from public.song_segments s
            ) x
            order by x.tk, x.ak, x.created_at, x.id
        ) g
        order by g.created_at, g.id
    loop
        insert into public.songs (title, original_artist, created_at, updated_at)
        values (r.title, r.original_artist, r.created_at, r.created_at)
        returning id into v_id;
        insert into public.song_keys (title_key, artist_key, song_id, created_at)
        values (r.tk, r.ak, v_id, r.created_at);
    end loop;

    update public.song_segments s
    set song_id = k.song_id
    from public.song_keys k
    where k.title_key = public.song_norm_text(s.title)
      and k.artist_key = coalesce(public.song_norm_text(s.original_artist), '');
end;
$$;

alter table public.song_segments enable trigger song_segments_touch_updated_at;

alter table public.song_segments alter column song_id set not null;

-- ───────────── 自動配對 trigger ─────────────
-- INSERT：沒帶 song_id 就配對；有帶（拆開等後台操作）就照用。
-- UPDATE：song_id 被明確改掉（合併、拆開）就照用；設成 null 就重配；
--         song_id 沒動時，只有比對鍵真的改變才重配（只改寫法、備註、時間都保留歸屬）。
create or replace function public._song_segments_assign_song()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.song_id is null then
        new.song_id := public._song_for(new.title, new.original_artist);
    elsif tg_op = 'UPDATE'
          and new.song_id is not distinct from old.song_id
          and (new.title is distinct from old.title or new.original_artist is distinct from old.original_artist)
          and (public.song_norm_text(new.title) is distinct from public.song_norm_text(old.title)
               or coalesce(public.song_norm_text(new.original_artist), '')
                  is distinct from coalesce(public.song_norm_text(old.original_artist), '')) then
        new.song_id := public._song_for(new.title, new.original_artist);
    end if;
    return new;
end;
$$;

create trigger song_segments_assign_song
    before insert or update of title, original_artist, song_id on public.song_segments
    for each row execute function public._song_segments_assign_song();

-- ───────────── 孤兒歌清除（commit 時） ─────────────
-- 先鎖歌列（與新片段 FK 檢查的 FOR KEY SHARE 互斥），再以新快照確認沒有片段引用才刪。
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
            delete from public.songs s
            where s.id = old.song_id
              and not exists (select 1 from public.song_segments g where g.song_id = old.song_id);
        end if;
    end if;
    return null;
end;
$$;

-- 欄位限定的 UPDATE OF 不會因 BEFORE trigger 改值而觸發，所以用 WHEN 比對新舊 song_id
create constraint trigger song_segments_gc_update
    after update on public.song_segments
    deferrable initially deferred
    for each row
    when (old.song_id is distinct from new.song_id)
    execute function public._song_segments_gc();

create constraint trigger song_segments_gc_delete
    after delete on public.song_segments
    deferrable initially deferred
    for each row
    execute function public._song_segments_gc();

-- ───────────── 存檔本體：多讀寫 version_note，回傳帶歌 ─────────────
-- 以 20261027014100 的版本為基礎。version_note：更新時片段物件沒帶這個 key 就保留原值
-- （舊版 Function 或沒填備註欄的投稿不會把既有備註清掉）；帶了 null 就清空。新增時沒帶＝null。
-- 回傳的 segments[i] 多 song_id、version_note、song{id,title,artist,versions}（versions＝該歌目前的片段總數）。
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
            version_note = case when e ? 'version_note' then e->>'version_note' else s.version_note end
        from jsonb_array_elements(p_segments) e
        where e->>'id' is not null
          and s.id = (e->>'id')::uuid
          and (s.start_seconds, s.end_seconds, s.title, s.original_artist, s.position, s.version_note)
              is distinct from ((e->>'start_seconds')::integer, (e->>'end_seconds')::integer, e->>'title',
                                e->>'original_artist', (e->>'position')::smallint,
                                case when e ? 'version_note' then e->>'version_note' else s.version_note end);
    end if;

    -- 新片段：code 由 default 產生，撞號（極少見）就重抽，最多 5 次；song_id 由 trigger 配對
    for v_seg in select e from jsonb_array_elements(p_segments) e where e->>'id' is null loop
        for attempt in 1..5 loop
            begin
                insert into public.song_segments (video_ref, start_seconds, end_seconds, title, original_artist, position,
                                                  version_note)
                values (v_id, (v_seg->>'start_seconds')::integer, (v_seg->>'end_seconds')::integer,
                        v_seg->>'title', v_seg->>'original_artist', (v_seg->>'position')::smallint,
                        v_seg->>'version_note');
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
                       'song_id', s.song_id, 'version_note', s.version_note,
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

-- ───────────── 公開目錄：片段 8 欄＋尾端歌曲字典 ─────────────
--   影片元素同 20261027014007，s 每列：[code, start, end, 歌名, 原唱|null, 播放次數, song_id, 版本備註|null]
--   陣列最後一個元素：{"songs": [[song_id, 歌名, 原唱|null], ...]}，只列有已發布片段的歌（目錄為空時仍有這個元素）。
--   舊前端只讀前 6 欄、只認帶 v 的元素，多出來的欄位與字典元素會被忽略。
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
-- trigger 函式在觸發時不檢查 EXECUTE；內部呼叫一律經 security definer 函式，所以全部收回。
revoke all on function public.song_norm_text(text) from public, anon, authenticated;
revoke all on function public._song_for(text, text) from public, anon, authenticated;
revoke all on function public._song_segments_assign_song() from public, anon, authenticated;
revoke all on function public._song_segments_gc() from public, anon, authenticated;
-- create or replace 保留既有授權；再宣告一次讓本檔自成一份
revoke all on function public._save_song_video(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.get_song_catalog() from public, anon, authenticated;
grant execute on function public._save_song_video(uuid, jsonb, jsonb) to service_role;
grant execute on function public.get_song_catalog() to service_role;
