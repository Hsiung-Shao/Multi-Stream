-- 開台週表 階段 2：Twitch 週表（/helix/schedule）的分片游標。
-- 每次 schedule-heavy 呼叫處理 shard_size 個 Twitch 頻道（一個頻道一次 API 呼叫，沒有批次端點）；
-- 1,500 個頻道 ÷ 250 ≈ 6 片繞一圈。
-- 回滾：delete from public.cron_shard_state where job_name = 'schedule_twitch';
insert into public.cron_shard_state (job_name, shard_size) values ('schedule_twitch', 250)
on conflict (job_name) do nothing;
