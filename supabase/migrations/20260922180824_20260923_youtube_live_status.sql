-- YouTube 頻道直播狀態共享表（2026-09-23，路線圖階段 1）
--
-- 目的：第一個使用者查到的直播狀態寫進這裡，其他使用者直接讀資料庫，不再各自觸發
-- /api/youtube-channel-live-og（每次都要抓約 1.6MB 的 YouTube 頁面，Workers 免費方案 CPU 吃緊）。
-- 寫入：只有 live-og 端點以 service_role 寫（context.waitUntil 內 upsert）。
-- 讀取：前端以 anon key 批次 select，完全不經過 Workers。
-- 前端「永遠不能寫」：列內有影片連結，開放寫入等於讓人塞釣魚連結。
--
-- 回滾：
--   select cron.unschedule('cleanup_youtube_live_status_daily');
--   drop table if exists public.youtube_live_status;

create table public.youtube_live_status (
    channel_id          text primary key
                        check (channel_id ~ '^UC[a-zA-Z0-9_-]{22}$'),
    is_live             boolean not null default false,
    is_upcoming         boolean not null default false,
    -- 排程在 30 天之後的「週表框」（頻道擺一個很遠未來的排程直播放週表圖），不算即將直播
    is_schedule_frame   boolean not null default false,
    video_id            text
                        check (video_id is null or video_id ~ '^[a-zA-Z0-9_-]{11}$'),
    channel_title       text
                        check (channel_title is null or char_length(channel_title) <= 200),
    scheduled_start_at  timestamptz,
    checked_at          timestamptz not null default now()
);

comment on table public.youtube_live_status is
    'YouTube 頻道直播狀態共享快取；只由 /api/youtube-channel-live-og 以 service_role 寫入，前端唯讀';

-- 清理排程用
create index youtube_live_status_checked_at_idx on public.youtube_live_status (checked_at);

alter table public.youtube_live_status enable row level security;

-- 公開唯讀（直播狀態本來就是公開資訊）
create policy youtube_live_status_select
    on public.youtube_live_status
    for select
    to anon, authenticated
    using (true);

-- 不建立任何寫入 policy；再明確收回表層寫入權限，雙重保險
revoke insert, update, delete, truncate on public.youtube_live_status from anon, authenticated;

-- 每天清掉 30 天沒更新的列（資料庫內部 SQL，不走 HTTP，不受 Bot Fight Mode 影響）
select cron.schedule(
    'cleanup_youtube_live_status_daily',
    '20 3 * * *',
    $$delete from public.youtube_live_status where checked_at < now() - interval '30 days'$$
);
