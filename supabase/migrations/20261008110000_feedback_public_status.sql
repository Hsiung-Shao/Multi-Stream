-- 使用者回報（feedbacks）處理狀態改為公開用的四段＋封存
--
-- 公開狀態頁 /status 會顯示回報內容、狀態、日期（經 Pages Function /api/status，service_role 只撈這三欄並遮蔽聯絡資訊）。
-- 狀態：unread（未讀）→ read（已讀）→ processing（處理中）→ fixed（已修正）；archived（封存）。
-- 公開的只有 read／processing／fixed（站方看過才放行）；unread 與 archived 不公開。
-- 舊的 processed（已處理）一律視為 fixed。
-- RLS 不變：anon 仍不能直接讀寫 feedbacks（寫入走 /api/feedback/submit，管理者讀寫需 aal2）。
--
-- 上正式站前：先確認約束名稱是 feedbacks_status_check（
--   select conname from pg_constraint where conrelid = 'public.feedbacks'::regclass and contype = 'c';）
-- 並 select status, count(*) from feedbacks group by 1; 記下 processed 筆數。
--
-- 部署順序：**先套這支 migration，再部署 Pages**。反過來的話 /api/feedback/submit 會寫入不存在的 public_notice，
--   所有意見回饋都會送出失敗；後台存「處理中／已修正」也會撞 CHECK。
--
-- 回滾（順序也要反過來：先部署回舊版程式，再跑下列 SQL，否則新版 submit 會全部失敗）：
--   drop index if exists public.feedbacks_public_idx;
--   alter table public.feedbacks drop column if exists public_notice;
--   alter table public.feedbacks drop constraint feedbacks_status_check;
--   update public.feedbacks set status = 'processed' where status in ('processing', 'fixed');
--   alter table public.feedbacks add constraint feedbacks_status_check
--     check (status in ('unread', 'read', 'processed', 'archived'));

alter table public.feedbacks drop constraint if exists feedbacks_status_check;

update public.feedbacks set status = 'fixed' where status = 'processed';

alter table public.feedbacks add constraint feedbacks_status_check
  check (status in ('unread', 'read', 'processing', 'fixed', 'archived'));

comment on column public.feedbacks.status is
  '處理狀態：read／processing／fixed 會公開在 /status（只公開內容、狀態、日期，且只限 public_notice=true）；unread（站方未看過）與 archived 不公開。';

-- 送出時表單是否已告知「內容會公開」：只有 true 的回報才會出現在 /status。
-- 舊回報（在「只有管理者看得到」的前提下送出）一律 false，不追溯公開；舊快取頁面送出的也不會帶這個旗標。
alter table public.feedbacks add column if not exists public_notice boolean not null default false;

comment on column public.feedbacks.public_notice is
  '送出時表單已告知內容會公開（由 /api/feedback/submit 依 body.publicNotice 寫入）。false 的回報永遠不公開。';

create index if not exists feedbacks_public_idx
  on public.feedbacks (created_at desc)
  where public_notice and status <> 'archived';
