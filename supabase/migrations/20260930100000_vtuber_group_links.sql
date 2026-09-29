-- 藝人與團體的其他關係（2026-09-30 使用者裁定：合作藝人併進團體，但標記為合作；一人可與多家合作）
--
-- 正式所屬仍只記在 vtubers.group_id（一人一個；snapshot、名冊、個人頁、member_count trigger 都讀它）。
-- 這張表只放「非正式所屬」的關係，目前只有 collaborator（合作藝人）：
--   - 掛頂層公司（不是子團）；一人可掛多家；與 group_id 的公司可以不同
--   - until 有值＝合作已結束（名冊列「曾合作」，週表篩選不再帶出）
--   - member_count 不計合作
-- 資料由 scripts/build-collab-links.mjs 產生（20260930100100）。
--
-- 回滾：drop table if exists public.vtuber_group_links;

create table if not exists public.vtuber_group_links (
    vtuber_id uuid not null references public.vtubers(id) on delete cascade,
    group_id uuid not null references public.vtuber_groups(id) on delete cascade,
    role text not null check (role in ('collaborator')),
    since date,
    until date,
    source_url text,
    verified_at date,
    created_at timestamptz not null default now(),
    primary key (vtuber_id, group_id, role),
    check (until is null or since is null or until >= since)
);

create index if not exists vtuber_group_links_group_id_idx on public.vtuber_group_links (group_id);

comment on table public.vtuber_group_links is
    '藝人與團體的非正式所屬關係（目前只有合作藝人）；正式所屬在 vtubers.group_id';
comment on column public.vtuber_group_links.until is
    '關係結束日；null＝仍在合作';

alter table public.vtuber_group_links enable row level security;

-- 與 vtubers／vtuber_groups 相同：公開可讀、只有管理員（且啟用 MFA 者須 aal2）可寫
drop policy if exists "vtuber_group_links_select" on public.vtuber_group_links;
create policy "vtuber_group_links_select"
    on public.vtuber_group_links for select
    using (true);

drop policy if exists "vtuber_group_links_admin_insert" on public.vtuber_group_links;
create policy "vtuber_group_links_admin_insert"
    on public.vtuber_group_links for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "vtuber_group_links_admin_update" on public.vtuber_group_links;
create policy "vtuber_group_links_admin_update"
    on public.vtuber_group_links for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "vtuber_group_links_admin_delete" on public.vtuber_group_links;
create policy "vtuber_group_links_admin_delete"
    on public.vtuber_group_links for delete
    to authenticated
    using (public.is_admin());

drop policy if exists "vtuber_group_links_admin_requires_aal2" on public.vtuber_group_links;
create policy "vtuber_group_links_admin_requires_aal2"
    on public.vtuber_group_links
    as restrictive
    to authenticated
    using (
        not (public.is_admin() and public.has_verified_mfa())
        or public.auth_is_aal2()
    )
    with check (
        not (public.is_admin() and public.has_verified_mfa())
        or public.auth_is_aal2()
    );
