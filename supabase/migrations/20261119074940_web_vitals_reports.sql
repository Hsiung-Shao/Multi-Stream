-- 匿名 Web Vitals 回報（2026-11-19）。
-- GA4 的 web_vitals 只收得到同意 Cookie 的訪客，解釋不了 CrUX 的實測數字；
-- 這張表收全體訪客「不良」的 CLS／INP 是哪個元素、哪一頁（functions/api/vitals.js 以 service_role 寫入）。
-- 不存 IP、UA 或任何識別碼；每小時最多 500 列（trigger）。開 RLS 且不建 policy：anon／authenticated 讀寫都不行。
-- 保存 90 天，每日 UTC 03:20 清一次。
--
-- 回滾：
--   select cron.unschedule('web_vitals_reports_cleanup');
--   drop table public.web_vitals_reports;
--   drop function public.web_vitals_reports_cap();

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

-- 每小時總量上限：超過就靜默丟棄（回 null＝這一列不寫入，不報錯）。
-- 端點不做每 IP 限流（不碰 IP；KV 每日寫入額度也不夠每筆計數），灌爆的防線放這裡：最多 500 列／小時。
create function public.web_vitals_reports_cap() returns trigger
language plpgsql set search_path = '' as $$
begin
    if (select count(*) from public.web_vitals_reports where created_at > now() - interval '1 hour') >= 500 then
        return null;
    end if;
    return new;
end $$;
revoke execute on function public.web_vitals_reports_cap() from public, anon, authenticated;

create trigger web_vitals_reports_cap before insert on public.web_vitals_reports
    for each row execute function public.web_vitals_reports_cap();

-- 清理、上限計數與依時間查詢都走這個索引
create index web_vitals_reports_created_at_idx on public.web_vitals_reports (created_at);

select cron.schedule(
    'web_vitals_reports_cleanup',
    '20 3 * * *',
    $$delete from public.web_vitals_reports where created_at < now() - interval '90 days'$$
);
