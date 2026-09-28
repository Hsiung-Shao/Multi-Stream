-- 暫停所有會呼叫 /api/cron/* 的 pg_cron 排程（使用者 2026-09-23 決定：先停掉，不設 WAF skip rule）
--
-- 原因：multistreaming.org 開著 Bot Fight Mode，pg_net 的請求一律被 Cloudflare 挑戰頁擋下
--（net._http_response 全是 403「Just a moment...」），30 天 21.55k 次請求沒有一次進到 Function，
-- 等於白白消耗請求配額。見 memory error_pgcron_cloudflare_bot_challenge。
--
-- 只「停用」不刪除：排程定義（含 Authorization header 的 command）完整保留，恢復只要一行。
-- 以 jobname 比對而非寫死 jobid，換環境也能套用。
-- cleanup_old_logs_daily 是資料庫內部清理、不走 HTTP，不在此範圍。
--
-- 回滾（恢復排程；前提是 /api/cron/* 已在 WAF 設好 Bot Fight Mode skip rule，否則恢復了也是 403）：
--   select cron.alter_job(jobid, active := true)
--   from cron.job
--   where jobname in ('sync_vtuber_livestreams', 'snapshot_vtuber_subscribers');

select cron.alter_job(jobid, active := false)
from cron.job
where jobname in ('sync_vtuber_livestreams', 'snapshot_vtuber_subscribers');
