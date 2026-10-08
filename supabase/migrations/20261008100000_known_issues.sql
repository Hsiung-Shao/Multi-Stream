-- 已知問題 (Known Issues) - 公開狀態頁 /status 的資料來源
--
-- 站方把使用者回報（feedbacks）整理成可公開的條目：標題、處理狀態、影響範圍、站方回應。
-- 使用者原文不進這張表，避免個資外流。
--
-- RLS 設計：開 RLS、不加任何 policy → 只有 service_role 能讀寫。
--   公開讀取走 Pages Function /api/status（只回 is_public=true 的欄位子集，並在 edge 快取）
--   後台寫入走 /api/admin/known-issues（gateAdmin）
--   與 cron_shard_state 相同做法，不開新的 anon 存取面。
--
-- 回滾：drop table public.known_issues;（無其他物件依賴）

create table public.known_issues (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text check (body is null or char_length(body) <= 4000),
  status text not null default 'investigating'
    check (status in ('investigating', 'identified', 'fixing', 'monitoring', 'resolved')),
  severity text not null default 'minor'
    check (severity in ('minor', 'major')),
  areas text[] not null default '{}'
    check (areas <@ array['canvas', 'youtube', 'twitch', 'chat', 'schedule', 'favorites', 'other']::text[]),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.known_issues is
  '公開狀態頁的已知問題。RLS 開啟但無 policy，只有 service_role（Pages Function）可讀寫。';
comment on column public.known_issues.body is
  '站方回應（公開顯示）。不得貼入使用者回報原文。';
comment on column public.known_issues.resolved_at is
  'status 改為 resolved 時由後台端點填入；改回其他狀態時清空。公開頁只顯示 14 天內解決的條目。';

create index known_issues_public_idx
  on public.known_issues (is_public, status, updated_at desc);

create trigger known_issues_touch_updated_at
  before update on public.known_issues
  for each row execute function public.touch_updated_at();

alter table public.known_issues enable row level security;

revoke all on public.known_issues from anon, authenticated;
