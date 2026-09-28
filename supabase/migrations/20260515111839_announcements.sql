-- 推送公告 (Announcements) - 建表 + RLS
--
-- 目的:提供管理員推送三種公告/互動內容到全站訪客或登入使用者。
--   - announcement:單純公告(markdown body),例:維護通知、新功能說明
--   - poll:單選/多選投票(payload.options + multi_select)
--   - survey:問卷(payload.questions[].type ∈ single|multi|text)
--
-- Schema 概觀:
--   announcements           -- admin 建立的公告本體
--   announcement_responses  -- 訪客 (anon by device_id) / 使用者 (auth.uid()) 提交的回應
--
-- RLS 設計:
--   announcements
--     - 任何人 (anon + authenticated) 可 SELECT 已 published 且在 starts_at..ends_at 時間窗的公告
--     - admin (aal2) 可 INSERT/UPDATE/DELETE,沿用既有 hardening 慣例
--   announcement_responses
--     - 任何人可 INSERT(rate limit / 重複防範交給 endpoint + unique index)
--     - 只有 admin (aal2) 可 SELECT
--     - UPDATE/DELETE 沒 policy,只能 service_role 動

-- ============================================================================
-- 1. announcements
-- ============================================================================

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('announcement', 'poll', 'survey')),
  title text not null,
  body text,
  payload jsonb,
  target_segment text not null default 'all'
    check (target_segment in ('all', 'authenticated')),
  priority smallint not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.announcements is
  '管理員推送的公告/投票/問卷主表。RLS:public 僅可看 status=published 且時間窗內,admin 寫入需 aal2。';
comment on column public.announcements.payload is
  'type-specific payload。announcement: null/{}; poll: {options: [{id, label}], multi_select: bool}; survey: {questions: [{id, label, type, options?}]}';
comment on column public.announcements.target_segment is
  '目標族群:all=所有人 / authenticated=僅已登入。RLS 不擋,前端與 endpoint 自行比對。';
comment on column public.announcements.priority is
  '同時多公告排序權重,數字大者優先顯示。';

create index announcements_active_idx
  on public.announcements (status, starts_at, ends_at)
  where status = 'published';

create trigger announcements_touch_updated_at
  before update on public.announcements
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 2. announcement_responses
-- ============================================================================

create table public.announcement_responses (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid references auth.users(id),
  device_id text,
  choices jsonb,
  text_response text,
  created_at timestamptz not null default now(),
  constraint announcement_responses_device_id_chk
    check (device_id is null or (length(device_id) between 1 and 128)),
  constraint announcement_responses_identity_chk
    check (user_id is not null or device_id is not null)
);

comment on table public.announcement_responses is
  '使用者對 announcements 的回應(投票/問卷答覆)。RLS:public 可 INSERT,僅 admin (aal2) 可 SELECT。';
comment on column public.announcement_responses.choices is
  'poll: [{option_id}, ...] 或 survey: [{question_id, option_ids?: [...], text?: ...}]';
comment on column public.announcement_responses.device_id is
  '匿名訪客 LocalStorage UUID,用於防重複投票。已登入則填 user_id 並可留 null。';

create unique index announcement_responses_user_uidx
  on public.announcement_responses (announcement_id, user_id)
  where user_id is not null;

create unique index announcement_responses_device_uidx
  on public.announcement_responses (announcement_id, device_id)
  where user_id is null and device_id is not null;

create index announcement_responses_announcement_idx
  on public.announcement_responses (announcement_id);

-- ============================================================================
-- 3. RLS — announcements
-- ============================================================================

alter table public.announcements enable row level security;

create policy "announcements_public_select_active"
  on public.announcements
  for select
  to anon, authenticated
  using (
    status = 'published'
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  );

create policy "announcements_admin_write"
  on public.announcements
  as permissive
  for all
  to authenticated
  using (public.is_admin() and public.auth_is_aal2())
  with check (public.is_admin() and public.auth_is_aal2());

-- ============================================================================
-- 4. RLS — announcement_responses
-- ============================================================================

alter table public.announcement_responses enable row level security;

create policy "announcement_responses_public_insert"
  on public.announcement_responses
  for insert
  to anon, authenticated
  with check (true);

create policy "announcement_responses_admin_select"
  on public.announcement_responses
  for select
  to authenticated
  using (public.is_admin() and public.auth_is_aal2());
