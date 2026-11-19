-- 匿名 Web Vitals 回報（2026-11-19）。
-- GA4 的 web_vitals 只收得到同意 Cookie 的訪客，解釋不了 CrUX 的實測數字；
-- 這張表收全體訪客「不良」的 CLS／INP 是哪個元素、哪一頁（functions/api/vitals.js 以 service_role 寫入）。
-- 不存 IP、UA 或任何識別碼。開 RLS 且不建 policy：anon／authenticated 讀寫都不行。
-- 保存 90 天，每日 UTC 03:20 清一次。
--
-- 回滾：
--   select cron.unschedule('web_vitals_reports_cleanup');
--   drop table public.web_vitals_reports;

create table public.web_vitals_reports (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    metric text not null check (metric in ('CLS', 'INP')),
    value numeric not null check (value >= 0),
    rating text not null check (rating in ('needs-improvement', 'poor')),
    target text not null default '' check (char_length(target) <= 100),
    landing_path text not null check (char_length(landing_path) <= 120),
    page_path text not null check (char_length(page_path) <= 120),
    device text not null check (device in ('mobile', 'desktop')),
    vw integer not null check (vw between 0 and 20000),
    vh integer not null check (vh between 0 and 20000)
);

alter table public.web_vitals_reports enable row level security;
revoke all on public.web_vitals_reports from anon, authenticated;

-- 清理與依時間查詢都走這個索引
create index web_vitals_reports_created_at_idx on public.web_vitals_reports (created_at);

select cron.schedule(
    'web_vitals_reports_cleanup',
    '20 3 * * *',
    $$delete from public.web_vitals_reports where created_at < now() - interval '90 days'$$
);
