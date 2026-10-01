-- 週表排程的正式觸發方式（2026-10-02 使用者核准）：pg_cron + pg_net 直接呼叫 Supabase Edge Function 網址。
--
-- 為什麼：Cloudflare 免費版 Bot Fight Mode 會擋打回 multistreaming.org 的伺服器請求（不能 skip），
-- 而且規定 pg_cron 不可打 multistreaming.org；直接打 <project>.supabase.co/functions/v1/<fn> 不經過 Cloudflare。
-- 這是 Supabase 官方文件的做法（Scheduling Edge Functions），金鑰放 Vault、不寫進 cron 指令或本檔。
--
-- 認證：三支函式部署時 verify_jwt = false（supabase/config.toml），由函式自己比對 x-schedule-secret
-- （supabase/functions/_shared/auth.ts，固定時間比對）。Vault 的 schedule_cron_secret 與 Edge Function 的
-- SCHEDULE_CRON_SECRET 必須是同一個值。
--
-- 三支函式（2026-10-02 實測後把 Light 拆成兩支：RSS 與 live-og 在同一次呼叫會超過 2 秒 CPU 上限）：
--   schedule-live   每 10 分（:00、:10…）：YouTube 直播狀態（live-og）
--   schedule-light  每 10 分（:05、:15…）：RSS 新影片、Twitch 直播中
--   schedule-heavy  每 20 分（:02、:22、:42）：全量 RSS 分片、Twitch 週表、重查
-- 頻率依使用者裁定（Light 每 10 分、Heavy 每 20 分）；兩支會抓 RSS 的（light、heavy）錯開，snapshot 約每 5 分更新。
-- 同一支不會重疊：Edge Function 執行上限 150 秒（免費方案），遠小於間隔。
--
-- 需要的 Vault 金鑰（沒有時 schedule_invoke 只記 warning、不發請求；本地預設就是這樣，所以本地 job 是 no-op）：
--   select vault.create_secret('https://<project-ref>.supabase.co', 'schedule_project_url');
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'schedule_cron_secret');
--
-- 觀察：
--   select jobid, jobname, schedule, active from cron.job where jobname in ('schedule_live', 'schedule_light', 'schedule_heavy');
--   select * from cron.job_run_details where jobid in (select jobid from cron.job where jobname like 'schedule_%') order by start_time desc limit 10;
--   select id, status_code, left(content, 300), error_msg, created from net._http_response order by id desc limit 10;
--   select job_name, last_run_at, last_run_stats->'errors' from public.cron_shard_state where job_name like 'schedule_%';
-- 緊急停用（不刪）：select cron.alter_job(jobid, active := false) from cron.job where jobname in ('schedule_live', 'schedule_light', 'schedule_heavy');
-- 手動觸發一次：select private.schedule_invoke('schedule-light');
--
-- 回滾：
--   select cron.unschedule('schedule_live');
--   select cron.unschedule('schedule_light');
--   select cron.unschedule('schedule_heavy');
--   drop function if exists private.schedule_invoke(text);
--   delete from public.cron_shard_state where job_name = 'schedule_live_og';

-- pg_net：先前只在本地專用 migration 建立；正式站沒有時函式本體執行才會報錯，這裡確保存在
create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.schedule_invoke(fn text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    project_url text;
    cron_secret text;
begin
    if fn not in ('schedule-live', 'schedule-light', 'schedule-heavy') then
        raise exception 'schedule_invoke: unsupported function %', fn;
    end if;
    select decrypted_secret into project_url from vault.decrypted_secrets where name = 'schedule_project_url';
    select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'schedule_cron_secret';
    if project_url is null or cron_secret is null then
        -- warning 會進資料庫日誌；cron 仍顯示成功，健康與否以 cron_shard_state.last_run_at 是否更新為準
        raise warning 'schedule_invoke: vault 缺 schedule_project_url 或 schedule_cron_secret，略過 %', fn;
        return null;
    end if;
    return net.http_post(
        url := rtrim(project_url, '/') || '/functions/v1/' || fn,
        body := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-schedule-secret', cron_secret),
        timeout_milliseconds := 150000
    );
end;
$$;

revoke all on function private.schedule_invoke(text) from public, anon, authenticated;

-- schedule-live 的執行統計放這一列（沒有游標）
insert into public.cron_shard_state (job_name, shard_size) values ('schedule_live_og', 0)
on conflict (job_name) do nothing;

-- 同名排程已存在時 cron.schedule 會更新它（重套安全）
select cron.schedule('schedule_live', '*/10 * * * *', $$select private.schedule_invoke('schedule-live')$$);
select cron.schedule('schedule_light', '5-59/10 * * * *', $$select private.schedule_invoke('schedule-light')$$);
select cron.schedule('schedule_heavy', '2-59/20 * * * *', $$select private.schedule_invoke('schedule-heavy')$$);
