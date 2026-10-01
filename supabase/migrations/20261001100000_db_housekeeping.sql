-- 資料庫空間整理（2026-10-01，正式站資料庫 0.527／0.5GB 超過免費方案上限後）
--
-- 背景：
--   - net._http_response 348MB（只剩 180 筆）：停用前的 HTTP 排程每 2 分鐘收到 Bot Fight 挑戰頁，
--     刪除後空間沒有歸還。已在 SQL Editor 一次性 truncate，不放在 migration（本地重建時沒有這個問題）。
--   - cron.job_run_details 41MB（04-29 起 81k 筆）：pg_cron 不會自己清執行紀錄。
--     已一次性刪除 14 天前的紀錄並 vacuum full；這裡加每日清理，避免再長回去。
--   - vtuber_channel_metrics_daily_lookup_idx（channel_id, metric_date DESC）17MB、只用過 8 次：
--     與唯一索引 (channel_id, metric_date) 重複，btree 可以反向掃描，刪掉不影響查詢。
--
-- 回滾：
--   select cron.unschedule('cleanup_cron_run_details_daily');
--   create index vtuber_channel_metrics_daily_lookup_idx
--       on public.vtuber_channel_metrics_daily (channel_id, metric_date desc);

-- 每天清掉 14 天前的排程執行紀錄（資料庫內部 SQL，不走 HTTP）；同名排程已存在時 cron.schedule 會更新它
select cron.schedule(
    'cleanup_cron_run_details_daily',
    '40 3 * * *',
    $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$
);

drop index if exists public.vtuber_channel_metrics_daily_lookup_idx;
