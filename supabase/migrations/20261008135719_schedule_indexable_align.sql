-- 個人週表頁「可索引」規則對齊頁面實際顯示的內容（修 GSC soft 404）
--
-- 問題（2026-10-08 GSC）：舊規則是「近 90 天有 live/ended/scheduled（含 fetched_at 後備）」，
-- 但頁面只顯示近 30 天結束的場次＋未來 7 天排程，1989 個可索引頁有 221 個打開是空的
-- （例：/schedule/684890d8 被判 soft 404）。
--
-- 新規則＝頁面三個區塊（src/features/schedule/personSource.ts 的 splitPersonStreams）其中一個有東西：
--   - 直播中：status='live'
--   - 接下來：status='scheduled' 且開始時間在 now−15 分（UPCOMING_GRACE_MS）～now+7 天（PERSON_UPCOMING_DAYS）
--   - 最近：status='ended' 且 actual_end 在近 90 天（PERSON_RECENT_DAYS，同步由 30 改 90）
--   都排除週表框（is_schedule_frame）與被合併的列（merged_with；頁面在主場次也在時把它掛在主場次底下、不單獨顯示。
--   主場次已不在頁面查詢範圍的「孤兒」副場次頁面會單獨顯示，這裡不算——只會漏收、不會造成 soft 404；2026-10-08 正式站孤兒為 0）。
--   不再用 fetched_at 後備。
-- 改這裡的天數要同步改 personSource.ts 的常數（tests/functions/schedulePersonEdge.test.ts 鎖）。
--
-- 套用時預估（2026-10-08 正式站）：可索引 1989 → 1901（90 個真的空頁轉 noindex、2 個新增）。
-- 呼叫者不變：schedule-heavy 每圈開頭呼叫一次；sitemap-schedule.xml 讀 schedule_indexable。
-- 回滾：重新套 20260929100000_schedule_stage2.sql 裡的舊函式本體，再 select public.refresh_schedule_indexable();

create or replace function public.refresh_schedule_indexable()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    changed integer;
begin
    with active as (
        select distinct vtuber_id
        from public.streams
        where not is_schedule_frame
          and merged_with is null
          and (
              status = 'live'
              or (status = 'scheduled'
                  and scheduled_start >= now() - interval '15 minutes'
                  and scheduled_start <= now() + interval '7 days')
              or (status = 'ended' and actual_end >= now() - interval '90 days')
          )
    )
    update public.vtubers v
    set schedule_indexable = (a.vtuber_id is not null)
    from public.vtubers v2
    left join active a on a.vtuber_id = v2.id
    where v2.id = v.id
      and v.schedule_indexable is distinct from (a.vtuber_id is not null);
    get diagnostics changed = row_count;
    return changed;
end;
$$;

revoke all on function public.refresh_schedule_indexable() from public, anon, authenticated;
grant execute on function public.refresh_schedule_indexable() to service_role;

comment on column public.vtubers.schedule_indexable is
    '個人週表頁是否可被搜尋引擎索引：頁面有內容（直播中、未來 7 天排程、近 90 天結束的場次）。由 refresh_schedule_indexable() 更新（排程 Heavy 每圈呼叫）。';

-- 立即套用新規則（sitemap 與 robots 跟著變）
select public.refresh_schedule_indexable();
