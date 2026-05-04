-- B1.3 — 排程 vtuber_livestreams 自動同步
--
-- 注意：本 migration 為「待手動 apply」的 SQL，不在 push 時自動跑。
-- 觸發方式：使用者在 Supabase Dashboard → SQL Editor 執行，或在
-- Supabase MCP 環境用 apply_migration 主動執行。
--
-- 前置條件：
-- 1. pg_cron extension 已啟用（已是 1.6.4 版）
-- 2. pg_net extension 必須啟用 — Dashboard → Database → Extensions → 啟用 pg_net
-- 3. Cloudflare Pages 環境變數已設：
--    - CRON_SHARED_SECRET (secret) — 例如：openssl rand -hex 32 產生
-- 4. 將下方 :CRON_SHARED_SECRET 與 :MULTISTREAM_URL 替換為實際值
--
-- 執行頻率：每 2 分鐘（'*/2 * * * *'）
-- 影響：每 2 分鐘觸發一次 https://multistreaming.org/api/cron/sync-livestreams
-- 預期 Function 跑時 5-25 秒（YouTube HTML 並行偵測為瓶頸）

-- 確保 pg_net 已啟用（若未啟用會 raise error，使用者應先啟用）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        RAISE EXCEPTION 'pg_net extension is required. Enable it in Supabase Dashboard → Database → Extensions';
    END IF;
END $$;

-- 移除舊 job（若存在）後重新排程
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync_vtuber_livestreams') THEN
        PERFORM cron.unschedule('sync_vtuber_livestreams');
    END IF;
END $$;

-- 建立排程：每 2 分鐘呼叫 Cloudflare Pages Function
-- ⚠️ 執行此 SQL 前必須將 'YOUR_CRON_SHARED_SECRET' 替換為實際 secret
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

-- 驗證：列出所有排程
-- SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'sync_vtuber_livestreams';
--
-- 緊急停用：
-- SELECT cron.unschedule('sync_vtuber_livestreams');
