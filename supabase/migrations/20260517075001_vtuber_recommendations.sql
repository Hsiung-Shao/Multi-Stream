-- VTuber 推薦功能 V1 — 3 張新表 + RLS
-- 對應 plan 階段 9 V1: 推薦核心 + 社群分類

create table public.vtuber_recommendations (
    id uuid primary key default gen_random_uuid(),
    vtuber_id uuid not null references public.vtubers(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    comment text check (comment is null or length(comment) between 1 and 500),
    created_at timestamptz not null default now(),
    unique (vtuber_id, user_id)
);
comment on table public.vtuber_recommendations is '使用者推薦本體 (V1)。UNIQUE(vtuber_id, user_id) 防同 user 重複推。';
create index vtuber_recommendations_daily_idx on public.vtuber_recommendations (created_at desc, vtuber_id);
create index vtuber_recommendations_vtuber_idx on public.vtuber_recommendations (vtuber_id);
create index vtuber_recommendations_user_idx on public.vtuber_recommendations (user_id, created_at desc);

create table public.vtuber_categories (
    id uuid primary key default gen_random_uuid(),
    name text unique not null check (length(name) between 1 and 30),
    slug text unique not null check (slug ~ '^[a-z0-9-]+$' and length(slug) between 1 and 50),
    description text check (description is null or length(description) <= 200),
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected', 'archived')),
    proposed_by uuid references auth.users(id) on delete set null,
    reviewer_notes text,
    reviewed_at timestamptz,
    created_at timestamptz not null default now()
);
comment on table public.vtuber_categories is '社群提案的 VTuber 分類。pending → admin (aal2) 審核 → approved/rejected;approved 才能被 tag。';
create index vtuber_categories_status_idx on public.vtuber_categories (status);

create table public.vtuber_category_tags (
    vtuber_id uuid not null references public.vtubers(id) on delete cascade,
    category_id uuid not null references public.vtuber_categories(id) on delete cascade,
    tagged_by uuid not null references auth.users(id) on delete set null,
    tagged_at timestamptz not null default now(),
    primary key (vtuber_id, category_id)
);
comment on table public.vtuber_category_tags is 'VTuber 對 approved category 的 tag。Endpoint 層額外驗 category.status=approved。';
create index vtuber_category_tags_category_idx on public.vtuber_category_tags (category_id);

alter table public.vtuber_recommendations enable row level security;
create policy "vtuber_recommendations_public_select" on public.vtuber_recommendations
    for select to anon, authenticated using (true);
create policy "vtuber_recommendations_self_insert" on public.vtuber_recommendations
    for insert to authenticated with check (user_id = auth.uid());
create policy "vtuber_recommendations_self_delete" on public.vtuber_recommendations
    for delete to authenticated using (user_id = auth.uid());

alter table public.vtuber_categories enable row level security;
create policy "vtuber_categories_public_select_approved" on public.vtuber_categories
    for select to anon, authenticated using (status = 'approved');
create policy "vtuber_categories_admin_full" on public.vtuber_categories
    as permissive for all to authenticated
    using (public.is_admin() and public.auth_is_aal2())
    with check (public.is_admin() and public.auth_is_aal2());

alter table public.vtuber_category_tags enable row level security;
create policy "vtuber_category_tags_public_select" on public.vtuber_category_tags
    for select to anon, authenticated using (true);
create policy "vtuber_category_tags_self_insert" on public.vtuber_category_tags
    for insert to authenticated with check (tagged_by = auth.uid());
create policy "vtuber_category_tags_self_delete" on public.vtuber_category_tags
    for delete to authenticated using (tagged_by = auth.uid());
