-- 開台週表 階段 2：個人週表頁的網址（slug）與可索引旗標
--
-- 使用者裁定（2026-09-29）：
--   - 網址用英數 handle：YouTube @handle 轉小寫符合規則就用它，否則 Twitch login，再不然 id 前 8 碼；產生後固定。
--   - 只收錄活躍的個人頁：近 90 天有開台或有排程（streams 有 live/ended/scheduled）才可索引。
--
-- slug 產生器的字元集必須是 CHECK 的子集（memory error_server_id_alphabet_vs_check），
-- 所以回填與 trigger 都只產生 [a-z0-9_-]，且先比對 CHECK 同一條 regex 再採用。
--
-- 回滾：
--   drop index if exists public.vtubers_slug_key;
--   drop trigger if exists vtubers_assign_slug on public.vtubers;
--   drop function if exists public.vtubers_assign_slug(), public.schedule_slug_candidate(uuid, text, text),
--                         public.refresh_schedule_indexable();
--   alter table public.vtubers drop column if exists slug, drop column if exists schedule_indexable;

alter table public.vtubers
    add column slug text,
    add column schedule_indexable boolean not null default false;

alter table public.vtubers
    add constraint vtubers_slug_format check (slug is null or slug ~ '^[a-z0-9][a-z0-9_-]{1,39}$');

comment on column public.vtubers.slug is
    '個人週表頁網址 /schedule/<slug>。英數 YouTube handle → Twitch login → id 前 8 碼；產生後固定，改名不跟著變。';
comment on column public.vtubers.schedule_indexable is
    '個人週表頁是否可被搜尋引擎索引：近 90 天有開台或有排程。由 refresh_schedule_indexable() 更新（排程 Heavy 每圈呼叫）。';

-- ===== slug 候選：與 trigger 共用同一套規則 =====
create or replace function public.schedule_slug_candidate(p_id uuid, p_youtube_channel_id text, p_twitch_login text)
returns text
language sql
stable
set search_path = public
as $$
    select coalesce(
        (select h from (
            select lower(regexp_replace(yc.custom_url, '^@', '')) as h
            from public.youtube_channels yc
            where yc.channel_id = p_youtube_channel_id
        ) x where h ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
        (select t from (select lower(p_twitch_login) as t) y where t ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
        left(replace(p_id::text, '-', ''), 8)
    );
$$;

revoke all on function public.schedule_slug_candidate(uuid, text, text) from public, anon, authenticated;
grant execute on function public.schedule_slug_candidate(uuid, text, text) to service_role;

-- ===== 回填（兩階段）=====
-- 第一階段：每個候選值由最早建立的那位拿到原值（真實 handle 優先）。
-- 第二階段：其餘的人加 -2、-3…，每個後綴都先查是否已被佔用
--   （例：A、B 的候選都是 foo，而 C 的 handle 本來就是 foo-2 → B 拿 foo-3，不會撞到 C）。
create unique index vtubers_slug_key on public.vtubers (slug);

with c as (
    select id, public.schedule_slug_candidate(id, youtube_channel_id, twitch_channel_id) as base, created_at
    from public.vtubers
), ranked as (
    select id, base, row_number() over (partition by base order by created_at, id) as rn from c
)
update public.vtubers v
set slug = r.base
from ranked r
where r.id = v.id and r.rn = 1;

do $$
declare
    r record;
    base text;
    candidate text;
    n int;
begin
    for r in select id, youtube_channel_id, twitch_channel_id from public.vtubers where slug is null order by created_at, id loop
        base := public.schedule_slug_candidate(r.id, r.youtube_channel_id, r.twitch_channel_id);
        n := 1;
        loop
            n := n + 1;
            candidate := left(base, 36) || '-' || n;
            exit when not exists (select 1 from public.vtubers where slug = candidate);
        end loop;
        update public.vtubers set slug = candidate where id = r.id;
    end loop;
end;
$$;

alter table public.vtubers alter column slug set not null;

-- ===== 新增 vtuber 時自動補 slug（遇到重複就加後綴） =====
create or replace function public.vtubers_assign_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    base text;
    candidate text;
    n int := 1;
begin
    if new.slug is not null then
        return new;
    end if;
    -- 同時兩筆新增拿到同一個候選值時，後者會在 unique index 失敗；交易鎖讓配號依序進行
    perform pg_advisory_xact_lock(hashtext('vtubers_assign_slug'));
    base := public.schedule_slug_candidate(new.id, new.youtube_channel_id, new.twitch_channel_id);
    candidate := base;
    while exists (select 1 from public.vtubers where slug = candidate) loop
        n := n + 1;
        candidate := left(base, 36) || '-' || n;
    end loop;
    new.slug := candidate;
    return new;
end;
$$;

create trigger vtubers_assign_slug
    before insert on public.vtubers
    for each row execute function public.vtubers_assign_slug();

-- ===== 可索引旗標：只改有變化的列（避免每圈觸發 updated_at） =====
create or replace function public.refresh_schedule_indexable()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    changed integer;
begin
    with active as (
        select distinct vtuber_id
        from public.streams
        where status in ('live', 'ended', 'scheduled')
          and not is_schedule_frame
          and coalesce(actual_start, scheduled_start, fetched_at) > now() - interval '90 days'
    )
    update public.vtubers v
    set schedule_indexable = (a.vtuber_id is not null)
    from public.vtubers v2
    left join active a on a.vtuber_id = v2.id
    where v2.id = v.id
      and v.schedule_indexable is distinct from (a.vtuber_id is not null);
    get diagnostics changed = row_count;
    return changed;
end;
$$;

revoke all on function public.refresh_schedule_indexable() from public, anon, authenticated;
grant execute on function public.refresh_schedule_indexable() to service_role;

create index streams_vtuber_time_idx on public.streams (vtuber_id, scheduled_start desc);
