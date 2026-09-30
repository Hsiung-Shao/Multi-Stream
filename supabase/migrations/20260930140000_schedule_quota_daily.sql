-- 開台週表：YouTube Data API 每日用量記錄（2026-09-30 配額用完事件後加上每日上限）。
-- 資料來源優先序改為 live-og > RSS > API；排程每次執行後把本輪 videos.list 用量加進這一列，
-- 依太平洋時間的日期（YouTube 配額重置時間）歸零；超過 rules.ts 的 DAILY_QUOTA_CAP 就整天不再打 API。
--   cursor_position＝當日已用單位；last_run_stats.day＝配額日（YYYY-MM-DD）
-- shard_size 在這一列沒有意義（欄位 not null，填 0）。
-- 回滾：delete from public.cron_shard_state where job_name = 'youtube_quota_daily';
insert into public.cron_shard_state (job_name, shard_size) values ('youtube_quota_daily', 0)
on conflict (job_name) do nothing;
