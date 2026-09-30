-- 開台週表：live-og 輪替與下播確認、每日配額原子累加（2026-09-30 code review 修正）。
--
-- schedule_channel_state 新增：
--   og_checked_at   最後一次 live-og 查詢時間；Light 依此由舊到新輪替，避免每輪名額被同一批頻道佔走
--   og_miss_streak  連續幾輪「頁面抓到了但沒看到直播」；達 2 次才把直播中的場次改成 ended（避免單次誤判就卡死）
-- schedule_add_quota(day, units)：YouTube API 每日用量原子累加（Light 與 Heavy 同時跑時先讀再寫會漏算）；
--   配額日不同就從 units 重新算起；只有 service_role 可呼叫。
--
-- 回滾：
--   drop function if exists public.schedule_add_quota(text, integer);
--   alter table public.schedule_channel_state drop column if exists og_miss_streak, drop column if exists og_checked_at;

alter table public.schedule_channel_state
    add column if not exists og_checked_at timestamptz,
    add column if not exists og_miss_streak smallint not null default 0 check (og_miss_streak >= 0);

comment on column public.schedule_channel_state.og_checked_at is 'live-og（/live 頁）最後查詢時間；Light 依此輪替';
comment on column public.schedule_channel_state.og_miss_streak is '連續幾輪抓到頁面但沒看到直播；達 2 次才結束直播中的場次';

create or replace function public.schedule_add_quota(p_day text, p_units integer)
returns integer
language sql
security invoker
set search_path = public
as $$
    update public.cron_shard_state
    set cursor_position = case when last_run_stats->>'day' = p_day then cursor_position + p_units else p_units end,
        last_run_stats = jsonb_build_object('day', p_day),
        last_run_at = now(),
        updated_at = now()
    where job_name = 'youtube_quota_daily'
    returning cursor_position;
$$;

revoke all on function public.schedule_add_quota(text, integer) from public, anon, authenticated;
grant execute on function public.schedule_add_quota(text, integer) to service_role;
