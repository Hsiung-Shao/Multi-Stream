-- 新增 Twitch 訂閱數分片快照 cron + 暫緩 sync_vtuber_livestreams
--
-- 背景：
-- snapshot_vtuber_subscribers（每日 00:05 UTC）與 sync_vtuber_livestreams（每 2 分鐘）
-- 這兩個 cron job 先前已排程 active，但對應的 Cloudflare Function 一直沒有部署到
-- main/production，因此每次觸發都被 Bot Fight Mode 擋下回 403，從未真正執行過。
--
-- 這次補上 Function 實作時發現：正式環境有 1362 個啟用中的 Twitch vtuber、
-- 2470 個 YouTube vtuber，原本「每個 vtuber 各打幾次 API/DB」的逐筆設計，單次
-- 執行 subrequest 數量會遠超 Cloudflare 每次呼叫的上限（估算 11000+ 次），
-- 執行到中途會被平台中斷、且從 HTTP 回應層看不出來。
--
-- 修復方式：
-- 1. YouTube 訂閱數（vtubers 表 + youtube_channels 全表快取）已改成批次
--    upsert，繼续用 snapshot_vtuber_subscribers 原排程（每日一次即可）。
-- 2. Twitch follower 沒有批次 API，改拆到新的 /api/cron/snapshot-twitch-followers，
--    用 KV 游標做環狀分片，需要較高頻排程（本 migration 排每 20 分鐘一次）才能
--    在一天內輪完全部 vtuber。
-- 3. sync_vtuber_livestreams（YouTube 直播偵測部分）同樣有 subrequest 超標風險
--    （2470 頻道 × 1-2 次 fetch，每 2 分鐘觸發），但修法（分片）會讓「現正直播」
--    的偵測延遲從 2 分鐘拉長到 25 分鐘左右，屬於產品體驗取捨，需要另外設計，
--    暫時 unschedule，待該 Function 修好後再另開 migration 重新排程。
--    （目前 next/production 前端尚未有任何頁面讀取 vtuber_livestreams，暫緩無使用者影響。）
--
-- 前置條件：與既有 cron 相同 —— Cloudflare Pages 已設 CRON_SHARED_SECRET，且
-- Cloudflare WAF Custom Rule 已放行 `/api/cron/*` + Bearer header 跳過 Bot Fight Mode。
--
-- 驗證：SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
--      SELECT jobid, jobname, status, return_message, start_time
--        FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
--        ORDER BY start_time DESC LIMIT 10;
-- 停用：SELECT cron.unschedule('snapshot_twitch_followers');
-- 復原 sync_vtuber_livestreams（待該 Function 修好後）：
--   重新執行 supabase/migrations 內原本排程它的那段 cron.schedule(...)

-- ===== 1. 暫緩 sync_vtuber_livestreams（YouTube 偵測 subrequest 問題未修復） =====
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync_vtuber_livestreams') THEN
        PERFORM cron.unschedule('sync_vtuber_livestreams');
    END IF;
END $$;

-- ===== 2. Twitch 訂閱數分片快照：每 20 分鐘 =====
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snapshot_twitch_followers') THEN
        PERFORM cron.unschedule('snapshot_twitch_followers');
    END IF;
END $$;

SELECT cron.schedule(
    'snapshot_twitch_followers',
    '*/20 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://multistreaming.org/api/cron/snapshot-twitch-followers',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer YOUR_CRON_SHARED_SECRET'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 28000
    ) AS request_id;
    $$
);

-- snapshot_vtuber_subscribers（既有，每日 00:05 UTC）沿用原排程，不需改動
