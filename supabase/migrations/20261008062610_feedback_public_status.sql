-- 使用者回報（feedbacks）處理狀態改為公開用的四段＋封存
--
-- 公開狀態頁 /status 會顯示回報內容、狀態、日期（經 Pages Function /api/status，service_role 只撈這三欄並遮蔽聯絡資訊）。
-- 狀態：unread（未讀）→ read（已讀）→ processing（處理中）→ fixed（已修正）；archived（封存）。
-- 公開的只有 read／processing／fixed（站方看過才放行）；unread 與 archived 不公開。
-- RLS 不變：anon 仍不能直接讀寫 feedbacks（寫入走 /api/feedback/submit，管理者讀寫需 aal2）。
--
-- 相容舊後台：**不轉換資料、CHECK 仍接受舊值 processed**。
--   套這支 migration 之後、新版 Pages 上線之前（也可能是 next 預覽測試的好幾天），正式站舊後台仍會送 processed；
--   若轉成 fixed 或從 CHECK 拿掉，舊後台會存檔失敗，且把 fixed 的回報都顯示成「未讀」。
--   新版程式把 processed 當成 fixed（後台顯示「已修正」、/api/status 輸出 fixed），下拉選單不再提供 processed。
--   新版上線一段時間、確認沒有舊後台後，可另開 migration 把 processed 轉 fixed 並從 CHECK 拿掉。
--
-- 部署順序：先套這支 migration，再部署 Pages（較安全）。反過來時 /api/feedback/submit 會在寫入失敗後
--   自動去掉 public_notice 重送（見 submit.js），回饋不會送不出去，只是那段時間送出的回報不會被公開。
--
-- 上正式站前：確認約束名稱是 feedbacks_status_check（
--   select conname from pg_constraint where conrelid = 'public.feedbacks'::regclass and contype = 'c';）
--
-- 這支可以重跑（drop … if exists／add … if not exists）。
--
-- 回滾（先部署回舊版程式，再跑下列 SQL）：
--   drop index if exists public.feedbacks_public_idx;
--   alter table public.feedbacks drop column if exists public_notice;
--   alter table public.feedbacks drop constraint feedbacks_status_check;
--   update public.feedbacks set status = 'processed' where status in ('processing', 'fixed');
--   alter table public.feedbacks add constraint feedbacks_status_check
--     check (status in ('unread', 'read', 'processed', 'archived'));

alter table public.feedbacks drop constraint if exists feedbacks_status_check;

alter table public.feedbacks add constraint feedbacks_status_check
  check (status in ('unread', 'read', 'processing', 'fixed', 'archived', 'processed'));

comment on column public.feedbacks.status is
  '處理狀態：read／processing／fixed（含舊值 processed，等同 fixed）會公開在 /status（只公開內容、狀態、日期，且只限 public_notice=true）；unread（站方未看過）與 archived 不公開。';

-- 送出時表單是否已告知「內容會公開」：只有 true 的回報才會出現在 /status。
-- 舊回報（在「只有管理者看得到」的前提下送出）一律 false，不追溯公開；舊快取頁面送出的也不會帶這個旗標。
alter table public.feedbacks add column if not exists public_notice boolean not null default false;

comment on column public.feedbacks.public_notice is
  '送出時表單已告知內容會公開（由 /api/feedback/submit 依 body.publicNotice 寫入）。false 的回報永遠不公開。';

create index if not exists feedbacks_public_idx
  on public.feedbacks (created_at desc)
  where public_notice and status <> 'archived';
