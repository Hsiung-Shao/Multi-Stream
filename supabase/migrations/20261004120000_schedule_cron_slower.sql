-- 週表排程降頻（2026-10-04 使用者指定）：
--   schedule_live ：*/10（每 10 分鐘）  → */20（:00、:20、:40）
--   schedule_heavy：2-59/20（每 20 分鐘）→ 2 * * * *（每小時 :02）
--   schedule_light：不變（5-59/10）
--
-- 影響：
--   - live：開播、改期最多晚約 20 分鐘才反映；下播要連續兩輪確認，最多約 40 分鐘
--   - heavy：每次處理一個分片（cron_shard_state.schedule_heavy_rss.shard_size，目前 400），
--     游標繞一圈＝一次全量，約 7 片 → 全量週期從約 2.3 小時拉長到約 7 小時；
--     游標歸零那片的「待處理場次重查」（改期、tombstone、常駐框）也跟著變成約 7 小時一次
--   - 前端共享表新鮮度（src/features/favorites/liveStatusRepository.ts LIVE_STATUS_FRESH_MS）同步改為 22 分鐘
--
-- 同名排程已存在時 cron.schedule 會更新它（重套安全）。
-- 回滾：
--   select cron.schedule('schedule_live', '*/10 * * * *', $$select private.schedule_invoke('schedule-live')$$);
--   select cron.schedule('schedule_heavy', '2-59/20 * * * *', $$select private.schedule_invoke('schedule-heavy')$$);
--   並把 LIVE_STATUS_FRESH_MS 改回 12 分鐘

select cron.schedule('schedule_live', '*/20 * * * *', $$select private.schedule_invoke('schedule-live')$$);
select cron.schedule('schedule_heavy', '2 * * * *', $$select private.schedule_invoke('schedule-heavy')$$);
