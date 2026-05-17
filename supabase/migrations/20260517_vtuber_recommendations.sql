-- VTuber 推薦功能 V1 — 3 張新表 + RLS
--
-- 取代舊 RecommendButton (commit 70a4579 已下架)。
-- V1 範圍 (對應 plan 階段 9):
--   1. canvas 收藏列表的「推薦」入口(寫 vtuber_recommendations)
--   2. /recommendations 獨立頁面(顯示推薦數 + 留言)
--   3. 推薦頁可快加收藏
--   4. 單日推薦排行榜(SQL: created_at >= now() - interval '24h' GROUP BY count)
--   10. 社群分類標籤(user 提案 → admin 審核 → approved 後可 tag)
--
-- Schema 概觀:
--   vtuber_recommendations   — 推薦本體(一個 user 對一個 vtuber 一票)
--   vtuber_categories        — 社群分類(user 提案,admin 審核)
--   vtuber_category_tags     — vtuber ↔ category 多對多(approved 才能 tag)
--
-- 防濫用設計(7 層,backend endpoint 負責 1-5、7;DB 負責 6):
--   1. IP banlist           (rate-limit.js)
--   2. trust_level           (auth-helper.js)
--   3. Turnstile             (verify-turnstile.js)
--   4. KV per-IP rate limit  (rate-limit.js)
--   5. DB daily quota        (increment_contribution_quota RPC)
--   6. DB UNIQUE 約束        (這份 migration 提供)
--   7. Content sanitize      (endpoint 內,trim + length + URL regex)

-- ============================================================================
-- 1. vtuber_recommendations
-- ============================================================================

create table public.vtuber_recommendations (
    id uuid primary key default gen_random_uuid(),
    vtuber_id uuid not null references public.vtubers(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    comment text check (comment is null or length(comment) between 1 and 500),
    created_at timestamptz not null default now(),
    -- 同 user 對同 vtuber 只能推薦一次(撤回後可重推)
    unique (vtuber_id, user_id)
);

comment on table public.vtuber_recommendations is
    '使用者推薦本體 (V1)。UNIQUE(vtuber_id, user_id) 防同 user 重複推。Endpoint POST 只接受 user 收藏內的 url,防繞 UI 任意推。';
comment on column public.vtuber_recommendations.comment is
    '推薦留言(選填,1-500 字)。Endpoint 層 sanitize + 禁 URL regex。';

-- 單日排行榜查詢索引(WHERE created_at >= now() - interval '24h')
create index vtuber_recommendations_daily_idx
    on public.vtuber_recommendations (created_at desc, vtuber_id);

-- 查單一 vtuber 全部推薦(留言列表 / 推薦數 count)
create index vtuber_recommendations_vtuber_idx
    on public.vtuber_recommendations (vtuber_id);

-- 查 user 自己推薦過哪些(我的推薦 tab)
create index vtuber_recommendations_user_idx
    on public.vtuber_recommendations (user_id, created_at desc);

-- ============================================================================
-- 2. vtuber_categories
-- ============================================================================

create table public.vtuber_categories (
    id uuid primary key default gen_random_uuid(),
    name text unique not null check (length(name) between 1 and 30),
    -- slug 用於 URL filter (?category=vsinger),只允許小寫英數 + dash
    slug text unique not null check (slug ~ '^[a-z0-9-]+$' and length(slug) between 1 and 50),
    description text check (description is null or length(description) <= 200),
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected', 'archived')),
    proposed_by uuid references auth.users(id) on delete set null,
    reviewer_notes text,
    reviewed_at timestamptz,
    created_at timestamptz not null default now()
);

comment on table public.vtuber_categories is
    '社群提案的 VTuber 分類。pending → admin (aal2) 審核 → approved/rejected;approved 才能被 tag。';
comment on column public.vtuber_categories.slug is
    'URL-safe 識別,小寫英數 + dash。前端用 ?category=<slug> filter。';

create index vtuber_categories_status_idx
    on public.vtuber_categories (status);

-- ============================================================================
-- 3. vtuber_category_tags(多對多)
-- ============================================================================

create table public.vtuber_category_tags (
    vtuber_id uuid not null references public.vtubers(id) on delete cascade,
    category_id uuid not null references public.vtuber_categories(id) on delete cascade,
    tagged_by uuid not null references auth.users(id) on delete set null,
    tagged_at timestamptz not null default now(),
    primary key (vtuber_id, category_id)
);

comment on table public.vtuber_category_tags is
    'VTuber 對 approved category 的 tag。Endpoint 層額外驗 category.status=approved(避免 tag pending/rejected/archived 的 category)。';

-- 反向查:某 category 有哪些 vtubers(filter 頁面用)
create index vtuber_category_tags_category_idx
    on public.vtuber_category_tags (category_id);

-- ============================================================================
-- 4. RLS — vtuber_recommendations
-- ============================================================================

alter table public.vtuber_recommendations enable row level security;

-- public 可讀(推薦頁要顯示所有推薦數、留言公開)
create policy "vtuber_recommendations_public_select"
    on public.vtuber_recommendations
    for select
    to anon, authenticated
    using (true);

-- 只 authenticated 可寫,且只能寫自己 user_id 的 row
create policy "vtuber_recommendations_self_insert"
    on public.vtuber_recommendations
    for insert
    to authenticated
    with check (user_id = auth.uid());

-- owner 可撤回自己的推薦
create policy "vtuber_recommendations_self_delete"
    on public.vtuber_recommendations
    for delete
    to authenticated
    using (user_id = auth.uid());

-- UPDATE 不開 policy(留言一旦寫了不能改;若要改要先 delete 再 insert)

-- ============================================================================
-- 5. RLS — vtuber_categories
-- ============================================================================

alter table public.vtuber_categories enable row level security;

-- public 只看得到 approved categories(filter bar 用)
create policy "vtuber_categories_public_select_approved"
    on public.vtuber_categories
    for select
    to anon, authenticated
    using (status = 'approved');

-- admin (aal2) 看全部 + 寫(沿用 hardening 慣例)
create policy "vtuber_categories_admin_full"
    on public.vtuber_categories
    as permissive
    for all
    to authenticated
    using (public.is_admin() and public.auth_is_aal2())
    with check (public.is_admin() and public.auth_is_aal2());

-- 注意:user 提案 pending category 走 endpoint service_role 寫(避免 user 自己塞 status=approved)

-- ============================================================================
-- 6. RLS — vtuber_category_tags
-- ============================================================================

alter table public.vtuber_category_tags enable row level security;

-- public 可讀(顯示 vtuber 的 tag chips)
create policy "vtuber_category_tags_public_select"
    on public.vtuber_category_tags
    for select
    to anon, authenticated
    using (true);

-- 只 authenticated insert,且只能寫自己 tagged_by 的 row
-- (額外的「category 必須 approved」驗證由 endpoint 負責,RLS 內查 categories 會 perf 差)
create policy "vtuber_category_tags_self_insert"
    on public.vtuber_category_tags
    for insert
    to authenticated
    with check (tagged_by = auth.uid());

-- owner 可撤回自己的 tag
create policy "vtuber_category_tags_self_delete"
    on public.vtuber_category_tags
    for delete
    to authenticated
    using (tagged_by = auth.uid());

-- ============================================================================
-- 7. 驗證查詢(apply 後手動跑)
-- ============================================================================
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE schemaname='public' AND tablename IN ('vtuber_recommendations','vtuber_categories','vtuber_category_tags')
-- ORDER BY tablename, policyname;
--
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname='public' AND tablename IN ('vtuber_recommendations','vtuber_categories','vtuber_category_tags')
-- ORDER BY tablename, indexname;
--
-- 排行榜 query 模板:
-- SELECT vtuber_id, count(*) AS votes
-- FROM vtuber_recommendations
-- WHERE created_at >= now() - interval '24 hours'
-- GROUP BY vtuber_id
-- ORDER BY votes DESC
-- LIMIT 10;

-- ============================================================================
-- 8. Rollback(依次 drop policies / tables)
-- ============================================================================
-- drop policy if exists "vtuber_category_tags_self_delete" on public.vtuber_category_tags;
-- drop policy if exists "vtuber_category_tags_self_insert" on public.vtuber_category_tags;
-- drop policy if exists "vtuber_category_tags_public_select" on public.vtuber_category_tags;
-- drop policy if exists "vtuber_categories_admin_full" on public.vtuber_categories;
-- drop policy if exists "vtuber_categories_public_select_approved" on public.vtuber_categories;
-- drop policy if exists "vtuber_recommendations_self_delete" on public.vtuber_recommendations;
-- drop policy if exists "vtuber_recommendations_self_insert" on public.vtuber_recommendations;
-- drop policy if exists "vtuber_recommendations_public_select" on public.vtuber_recommendations;
-- drop table if exists public.vtuber_category_tags;
-- drop table if exists public.vtuber_categories;
-- drop table if exists public.vtuber_recommendations;
