-- 【本地專用】用 pg_cron + pg_net 在容器內網路觸發排程 Edge Functions。
--
-- 正式站不套用這一支：正式環境的觸發方式仍是 Docs 的未決事項（Bot Fight Mode 會擋打回網站的請求；
-- 直接打 Supabase Edge Functions 的網址不經過 multistreaming.org，但要用 vault 放 service_role，
-- 另開 migration 處理）。
--
-- 本地：
--   - 目標是 kong 容器（http://supabase_kong_multi-stream:8000），不是 127.0.0.1（那是宿主機的 port）
--   - 需要 `supabase functions serve --env-file supabase/functions/.env --no-verify-jwt`
--     （--no-verify-jwt 讓閘道不檢查 JWT；函式內部仍會驗 x-schedule-secret）
--   - x-schedule-secret 的值對應 supabase/functions/.env 的 SCHEDULE_CRON_SECRET（預設 local-dev-schedule-secret）
--   - 觀察：select * from cron.job_run_details order by start_time desc limit 10;
--           select id, status_code, content::text from net._http_response order by id desc limit 5;
--   - 停用：select cron.alter_job(jobid, active := false) from cron.job where jobname like 'schedule_%_local';
create extension if not exists pg_net;

select cron.schedule(
    'schedule_light_local',
    '*/5 * * * *',
    $$
    select net.http_post(
        url := 'http://supabase_kong_multi-stream:8000/functions/v1/schedule-light',
        headers := '{"Content-Type": "application/json", "x-schedule-secret": "local-dev-schedule-secret"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
    $$
);

-- Heavy 每次只處理一片（shard_size 個頻道），每 10 分鐘一片、一圈約 7 片 ≈ 70 分鐘全量
select cron.schedule(
    'schedule_heavy_local',
    '*/10 * * * *',
    $$
    select net.http_post(
        url := 'http://supabase_kong_multi-stream:8000/functions/v1/schedule-heavy',
        headers := '{"Content-Type": "application/json", "x-schedule-secret": "local-dev-schedule-secret"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
    $$
);
