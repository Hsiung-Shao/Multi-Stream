-- 啟用 pg_cron 並排程每日清理 system_logs 與 contribution_rate_limits
-- 避免兩張 log table 無限增長

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 清理函式：保留 system_logs 90 天 / contribution_rate_limits 30 天
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.system_logs
    WHERE created_at < (now() - interval '90 days');

    DELETE FROM public.contribution_rate_limits
    WHERE day_bucket < (CURRENT_DATE - interval '30 days');

    DELETE FROM public.admin_actions
    WHERE created_at < (now() - interval '180 days');
END;
$$;

-- 移除舊 job（若存在）後重新排程，每日 UTC 03:00 執行
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_old_logs_daily') THEN
        PERFORM cron.unschedule('cleanup_old_logs_daily');
    END IF;
END $$;

SELECT cron.schedule(
    'cleanup_old_logs_daily',
    '0 3 * * *',
    $$SELECT public.cleanup_old_logs();$$
);
