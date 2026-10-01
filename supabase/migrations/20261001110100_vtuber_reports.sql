-- 資料回報（2026-10-01）：使用者回報 VTuber 資料、單場直播／週表、公司名冊的錯誤。
--
-- 不重用 feedbacks：回報要綁定對象（VTuber、團體、場次），處理狀態也不同（open／resolved／wontfix／duplicate／spam）。
-- 只經後台 API 讀寫（service_role）：開 RLS、不建任何 policy，並收回 anon／authenticated 的表層權限。
-- 單場直播在週表裡沒有資料庫 uuid（snapshot 以 platform＋external_id 識別），所以存這兩個值。
-- 「找不到這位 VTuber」在前端導向投稿頁，這裡也保留 missing_vtuber 類型（例如投稿頁外的入口）。
--
-- 回滾：
--   drop table if exists public.vtuber_reports;

create table public.vtuber_reports (
    id                  uuid primary key default gen_random_uuid(),
    kind                text not null check (kind in ('vtuber_info', 'stream', 'roster', 'missing_vtuber')),
    reasons             text[] not null default '{}'
                        check (
                            array_length(reasons, 1) is null
                            or (array_length(reasons, 1) <= 8 and reasons <@ array[
                                'name', 'group', 'nationality', 'graduated', 'channel_link',
                                'wrong_time', 'cancelled', 'duplicate', 'not_vtuber',
                                'missing_member', 'wrong_member', 'other'
                            ])
                        ),
    vtuber_id           uuid references public.vtubers (id) on delete set null,
    group_id            uuid references public.vtuber_groups (id) on delete set null,
    stream_platform     text check (stream_platform is null or stream_platform in ('youtube', 'twitch')),
    stream_external_id  text check (stream_external_id is null or char_length(stream_external_id) <= 64),
    description         text check (description is null or char_length(description) <= 1000),
    suggested           jsonb check (suggested is null or octet_length(suggested::text) <= 4096),
    source_urls         text[] not null default '{}'
                        check (array_length(source_urls, 1) is null or array_length(source_urls, 1) <= 5),
    contact             text check (contact is null or char_length(contact) <= 200),
    page_url            text check (page_url is null or char_length(page_url) <= 2048),
    status              text not null default 'open'
                        check (status in ('open', 'resolved', 'wontfix', 'duplicate', 'spam')),
    admin_notes         text check (admin_notes is null or char_length(admin_notes) <= 1000),
    resolved_at         timestamptz,
    ip_hash             text check (ip_hash is null or char_length(ip_hash) <= 64),
    created_at          timestamptz not null default now(),
    -- 依類型必須有的對象（被回報的 VTuber／團體之後若被刪除，FK 會變 null，所以只在新增時檢查）
    constraint vtuber_reports_stream_target check (kind <> 'stream' or (stream_platform is not null and stream_external_id is not null))
);

comment on table public.vtuber_reports is '使用者資料回報；只經 /api/report（寫）與 /api/admin/reports（讀、更新狀態）以 service_role 存取';

create index vtuber_reports_status_created_idx on public.vtuber_reports (status, created_at desc);
create index vtuber_reports_vtuber_idx on public.vtuber_reports (vtuber_id) where vtuber_id is not null;
create index vtuber_reports_group_idx on public.vtuber_reports (group_id) where group_id is not null;
create index vtuber_reports_stream_idx on public.vtuber_reports (stream_platform, stream_external_id) where stream_external_id is not null;

alter table public.vtuber_reports enable row level security;
revoke all on public.vtuber_reports from anon, authenticated;
