-- 排程 VTuber 自動化 cron(兩個 job)
--
-- ⚠️ 待手動執行的 SQL — 執行前必須把 YOUR_CRON_SHARED_SECRET 換成實際值。
--
-- 前置條件:
-- 1. pg_cron 1.6.4 + pg_net 0.19.5(已啟用 ✅)
-- 2. Cloudflare Pages 已設環境變數 CRON_SHARED_SECRET(與下方填的值一致)
-- 3. ⚠️ Function 必須先合 main → 部署到 multistreaming.org production
--    (在那之前 cron 每次觸發會打到不存在的 endpoint → 404/失敗,屬正常)
-- 4. ⚠️ Cloudflare WAF Custom Rule 放行 server-to-server 請求:
--    條件:(http.request.uri.path matches "^/api/cron/" and
--           http.request.headers["authorization"][0] contains "Bearer ")
--    動作:Skip → All Bot Fight Mode features
--
-- 驗證:SELECT jobname, schedule, active FROM cron.job;
--      SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- 停用:SELECT cron.unschedule('sync_vtuber_livestreams');
--      SELECT cron.unschedule('snapshot_vtuber_subscribers');

-- ===== 1. 直播同步:每 2 分鐘 =====
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync_vtuber_livestreams') THEN
        PERFORM cron.unschedule('sync_vtuber_livestreams');
    END IF;
END $$;

SELECT cron.schedule(
    'sync_vtuber_livestreams',
    '*/2 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://multistreaming.org/api/cron/sync-livestreams',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer YOUR_CRON_SHARED_SECRET'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 28000
    ) AS request_id;
    $$
);

-- ===== 2. 訂閱數快照:每日 00:05 UTC =====
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snapshot_vtuber_subscribers') THEN
        PERFORM cron.unschedule('snapshot_vtuber_subscribers');
    END IF;
END $$;

SELECT cron.schedule(
    'snapshot_vtuber_subscribers',
    '5 0 * * *',
    $$
    SELECT net.http_post(
        url := 'https://multistreaming.org/api/cron/snapshot-subscribers',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer YOUR_CRON_SHARED_SECRET'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 28000
    ) AS request_id;
    $$
);
