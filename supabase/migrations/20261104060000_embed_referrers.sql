-- 嵌入小工具（/embed/schedule/*）的「誰在用」統計。
-- 只記「哪個網站（Referer 主機）嵌了哪一份週表」：不記 IP、不記使用者；edge 端已去重 1 小時（functions/lib/embed-stats.js）。
--
-- 權限設計（避免 security definer view／anon definer 函式的 advisors 警告，也不把宿主站清單公開）：
--   - embed_referrers（明細，含 host）：RLS 開、不建任何 policy → anon／authenticated 讀寫都擋，只有 service_role 能碰。
--   - embed_usage（彙總，只有數量）：RLS 開、anon 只能 select；由 RPC 在同一交易內維護。
--   - embed_referrer_seen：security definer，只 grant service_role（edge 以 service_role 呼叫，見 functions/lib/supabase-server.js rpc）。
-- 回滾：
--   drop function public.embed_referrer_seen(text, text, text);
--   drop table public.embed_usage; drop table public.embed_referrers;

create table if not exists public.embed_referrers (
    kind       text not null check (kind in ('person', 'group')),
    slug       text not null check (char_length(slug) between 1 and 64),
    host       text not null check (char_length(host) between 1 and 253),
    first_seen timestamptz not null default now(),
    last_seen  timestamptz not null default now(),
    hits       integer not null default 1 check (hits >= 1),
    primary key (kind, slug, host)
);
alter table public.embed_referrers enable row level security;
revoke all on public.embed_referrers from public, anon, authenticated;

create table if not exists public.embed_usage (
    kind      text not null check (kind in ('person', 'group')),
    slug      text not null check (char_length(slug) between 1 and 64),
    sites     integer not null default 0 check (sites >= 0),
    last_seen timestamptz not null default now(),
    primary key (kind, slug)
);
alter table public.embed_usage enable row level security;
revoke all on public.embed_usage from public, anon, authenticated;
grant select on public.embed_usage to anon, authenticated, service_role;
drop policy if exists embed_usage_public_read on public.embed_usage;
create policy embed_usage_public_read on public.embed_usage for select to anon, authenticated using (true);

-- 單一份週表最多記 200 個宿主站（已存在的照常累加）；回 true＝這次有寫入
create or replace function public.embed_referrer_seen(p_kind text, p_slug text, p_host text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_slug text := lower(p_slug);
    v_host text := lower(p_host);
    v_sites integer;
    v_new boolean;
begin
    if p_kind is null or p_kind not in ('person', 'group') then return false; end if;
    if v_slug is null or char_length(v_slug) not between 1 and 64 then return false; end if;
    if v_host is null or char_length(v_host) not between 1 and 253 or v_host !~ '^[a-z0-9.-]+$' then return false; end if;

    v_new := not exists (select 1 from public.embed_referrers r where r.kind = p_kind and r.slug = v_slug and r.host = v_host);
    if v_new then
        select count(*) into v_sites from public.embed_referrers r where r.kind = p_kind and r.slug = v_slug;
        if v_sites >= 200 then return false; end if;
    end if;

    insert into public.embed_referrers (kind, slug, host) values (p_kind, v_slug, v_host)
    on conflict (kind, slug, host) do update set last_seen = now(), hits = public.embed_referrers.hits + 1;

    insert into public.embed_usage (kind, slug, sites, last_seen) values (p_kind, v_slug, 1, now())
    on conflict (kind, slug) do update set sites = public.embed_usage.sites + (case when v_new then 1 else 0 end), last_seen = now();
    return true;
end;
$$;
revoke all on function public.embed_referrer_seen(text, text, text) from public, anon, authenticated;
grant execute on function public.embed_referrer_seen(text, text, text) to service_role;
