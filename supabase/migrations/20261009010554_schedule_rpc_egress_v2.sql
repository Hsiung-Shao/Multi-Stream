-- 排程 RPC 出口流量瘦身第二輪（2026-10-09 code review）：接續 20261009010442_schedule_rpc_egress.sql（該檔不改）。
--
-- 第一輪實測兩個熱點：
--   A. 名冊太大：schedule_roster(null) 約 1.08MB、('youtube') 約 730KB，light 每天 144 輪讀全名冊、live 72 輪讀全部 YouTube。
--      → schedule_roster_v2：依用途只回需要的頻道（平台／分級／指定頻道／游標分片），欄式輸出、只帶用得到的欄位。
--   B. snapshot 指紋幾乎每輪都變（時間窗邊界每輪都在動），合併指紋同樣。
--      → snapshot 指紋的 now 相關邊界改用「p_now 往下取整到 30 分鐘」計算；輸出仍用真實 now，最多晚 30 分鐘把越界項目移出。
--      → 合併指紋只納入 computeMerges 真的會看的列（非常駐框、有開始時間；ended 只在同一實況主有開始時間相差 30 分鐘內的 scheduled／live 時才算，
--        因為 ended 只當主場次、只和同一實況主的場次配對，見 merge.ts）。
-- 其他：
--   - snapshot 來源改欄式、去掉 buildSnapshot 用不到的欄位（channel_id、scheduled_end、thumbnail_url；fetched_at 只在直播中列帶）
--   - check 回傳的指紋帶 check 時間（「md5@epoch 毫秒」）：mark 據此判斷先後，較早的 check 晚到時把指紋作廢（重疊執行時
--     Storage 可能被較舊的內容蓋掉，作廢讓下一輪重傳）；強制重傳的 60 分鐘也改以 check 時間計算
--   - 合併 mark 寫入前重算一次指紋，與 check 時不同就不記（避免記下一個沒驗證過的狀態）
--   - schedule_upsert_channel_states：同一 channel_id 重複時取陣列中最後一筆
--   - schedule_current_streams：共享表要看的「目前狀態」改 POST（取代 channel_id=in.(100 個 uuid) 的長網址 GET；light／heavy 用）
--   - schedule_touch_last_live：vtubers.last_live_at 改 POST（取代 id=in.(…) 的長網址 PATCH）
-- 全部 security definer＋search_path=''，只有 service_role 可呼叫。

-- ───────────── 小工具：欄式輸出的一格 ─────────────
-- to_json 的 null 是 SQL NULL，字串串接要補成 JSON 的 null
create or replace function public.schedule_jcell(p anyelement)
returns text
language sql
immutable
set search_path = ''
as $$
    select coalesce(to_json(p)::text, 'null');
$$;

-- ───────────── 名冊 v2 ─────────────
-- p_platform：必填（youtube／twitch）。p_tier：只要這個分級（null 不篩；沒有狀態列的頻道 tier 為 null，指定分級時不含）。
-- p_channel_ids：只要這些頻道。p_offset／p_limit：游標分片——依 id 排序後從 p_offset mod total 開始、繞回開頭，取 p_limit 筆
--   （與 TS 原本 [...slice(start), ...slice(0, start)].slice(0, size) 相同）；p_offset 為 null 時回全部。
-- 回傳 {"total": 篩選後總數, "start": 實際起點, "cols": [...], "rows": [[...], ...]}。
-- 欄位：youtube＝id,vtuber_id,external_id,tier,rss_fail_streak,last_new_video_at,og_checked_at,og_miss_streak；
--       twitch＝id,vtuber_id,external_id（Twitch 流程用不到狀態欄）。display_name 沒有任何流程用到，不帶。
create or replace function public.schedule_roster_v2(
    p_platform text,
    p_tier smallint default null,
    p_channel_ids uuid[] default null,
    p_offset integer default null,
    p_limit integer default null
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_total integer;
    v_start integer;
    v_rows text;
begin
    if p_platform is null or p_platform not in ('youtube', 'twitch') then
        raise exception 'schedule_roster_v2: p_platform 必須是 youtube 或 twitch' using errcode = '22023';
    end if;

    with base as (
        select c.id, c.vtuber_id, c.external_id,
               s.tier, s.rss_fail_streak, s.last_new_video_at, s.og_checked_at, s.og_miss_streak,
               (row_number() over (order by c.id) - 1)::integer as rn,
               (count(*) over ())::integer as total
        from public.vtuber_channels c
        join public.vtubers v on v.id = c.vtuber_id
        left join public.schedule_channel_state s on s.channel_id = c.id
        where c.status = 'active'
          and c.external_id is not null
          and v.activity <> 'graduate'
          and c.platform = p_platform
          and (p_tier is null or s.tier = p_tier)
          and (p_channel_ids is null or c.id = any (p_channel_ids))
    ), pos as (
        select b.*, (b.rn - st.start + b.total) % b.total as pos, st.start
        from base b
        cross join lateral (
            select case when p_offset is null then 0 else ((p_offset % b.total) + b.total) % b.total end as start
        ) st
    )
    select coalesce(max(total), 0), coalesce(max(start), 0),
           string_agg(
               case when p_platform = 'youtube' then
                   '[' || public.schedule_jcell(id) || ',' || public.schedule_jcell(vtuber_id) || ',' ||
                   public.schedule_jcell(external_id) || ',' || public.schedule_jcell(tier) || ',' ||
                   public.schedule_jcell(rss_fail_streak) || ',' || public.schedule_jcell(last_new_video_at) || ',' ||
                   public.schedule_jcell(og_checked_at) || ',' || public.schedule_jcell(og_miss_streak) || ']'
               else
                   '[' || public.schedule_jcell(id) || ',' || public.schedule_jcell(vtuber_id) || ',' ||
                   public.schedule_jcell(external_id) || ']'
               end,
               ',' order by pos)
               filter (where p_offset is null or p_limit is null or pos < p_limit)
    into v_total, v_start, v_rows
    from pos;

    return ('{"total":' || v_total || ',"start":' || v_start || ',"cols":' ||
            case when p_platform = 'youtube'
                 then '["id","vtuber_id","external_id","tier","rss_fail_streak","last_new_video_at","og_checked_at","og_miss_streak"]'
                 else '["id","vtuber_id","external_id"]' end ||
            ',"rows":[' || coalesce(v_rows, '') || ']}')::json;
end;
$$;

-- ───────────── 共享表的目前狀態（POST 版 loadCurrentByChannel） ─────────────
-- 範圍與欄位同 sweep.ts loadCurrentByChannel：YouTube、scheduled／live、不含社群週表／投稿，依 id 排序；欄式輸出
create or replace function public.schedule_current_streams(p_channel_ids uuid[])
returns json
language sql
stable
security definer
set search_path = ''
as $$
    select ('{"cols":["id","vtuber_id","channel_id","platform","external_id","source","status","scheduled_start",' ||
            '"scheduled_end","actual_start","actual_end","title","category","thumbnail_url","viewer_count",' ||
            '"is_schedule_frame","fetched_at"],"rows":[' ||
            coalesce(string_agg(
                '[' || public.schedule_jcell(s.id) || ',' || public.schedule_jcell(s.vtuber_id) || ',' ||
                public.schedule_jcell(s.channel_id) || ',' || public.schedule_jcell(s.platform) || ',' ||
                public.schedule_jcell(s.external_id) || ',' || public.schedule_jcell(s.source) || ',' ||
                public.schedule_jcell(s.status) || ',' || public.schedule_jcell(s.scheduled_start) || ',' ||
                public.schedule_jcell(s.scheduled_end) || ',' || public.schedule_jcell(s.actual_start) || ',' ||
                public.schedule_jcell(s.actual_end) || ',' || public.schedule_jcell(s.title) || ',' ||
                public.schedule_jcell(s.category) || ',' || public.schedule_jcell(s.thumbnail_url) || ',' ||
                public.schedule_jcell(s.viewer_count) || ',' || public.schedule_jcell(s.is_schedule_frame) || ',' ||
                public.schedule_jcell(s.fetched_at) || ']', ',' order by s.id), '') || ']}')::json
    from public.streams s
    where s.platform = 'youtube'
      and s.status in ('scheduled', 'live')
      and s.source not in ('community_post', 'user_submission')
      and s.channel_id = any (coalesce(p_channel_ids, '{}'::uuid[]));
$$;

-- ───────────── vtubers.last_live_at ─────────────
create or replace function public.schedule_touch_last_live(p_ids uuid[], p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_n integer;
begin
    update public.vtubers set last_live_at = p_now where id = any (coalesce(p_ids, '{}'::uuid[]));
    get diagnostics v_n = row_count;
    return v_n;
end;
$$;

-- ───────────── 頻道狀態寫入：同一 channel_id 取最後一筆 ─────────────
create or replace function public.schedule_upsert_channel_states(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_bad text;
begin
    if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
        return;
    end if;
    select k into v_bad
    from jsonb_array_elements(p_rows) r, jsonb_object_keys(r) k
    where k not in ('channel_id', 'tier', 'tier_reason', 'tier_updated_at', 'rss_fail_streak', 'rss_last_ok_at',
                    'rss_last_error', 'last_checked_at', 'last_new_video_at', 'og_checked_at', 'og_miss_streak')
    limit 1;
    if v_bad is not null then
        raise exception 'schedule_upsert_channel_states: 不支援的欄位 %', v_bad using errcode = '22023';
    end if;

    -- 1. 新頻道建列（既有列不動）
    insert into public.schedule_channel_state as s
        (channel_id, tier, tier_reason, tier_updated_at, rss_fail_streak, rss_last_ok_at, rss_last_error,
         last_checked_at, last_new_video_at, og_checked_at, og_miss_streak)
    select (r->>'channel_id')::uuid,
           coalesce((r->>'tier')::smallint, 2),
           case when r ? 'tier_reason' then r->>'tier_reason' else 'first_seen' end,
           coalesce((r->>'tier_updated_at')::timestamptz, now()),
           coalesce((r->>'rss_fail_streak')::integer, 0),
           (r->>'rss_last_ok_at')::timestamptz,
           r->>'rss_last_error',
           (r->>'last_checked_at')::timestamptz,
           (r->>'last_new_video_at')::timestamptz,
           (r->>'og_checked_at')::timestamptz,
           coalesce((r->>'og_miss_streak')::smallint, 0)
    from (
        select distinct on ((e.r->>'channel_id')::uuid) e.r
        from jsonb_array_elements(p_rows) with ordinality as e(r, ord)
        order by (e.r->>'channel_id')::uuid, e.ord desc
    ) d
    on conflict (channel_id) do nothing;

    -- 2. 只更新 payload 有的欄位（同一 channel_id 取陣列中最後一筆；UPDATE … FROM 多筆對應時結果不確定）
    update public.schedule_channel_state s set
        tier              = case when r ? 'tier' then coalesce((r->>'tier')::smallint, s.tier) else s.tier end,
        tier_reason       = case when r ? 'tier_reason' then r->>'tier_reason' else s.tier_reason end,
        tier_updated_at   = case when r ? 'tier_updated_at' then coalesce((r->>'tier_updated_at')::timestamptz, s.tier_updated_at) else s.tier_updated_at end,
        rss_fail_streak   = case when r ? 'rss_fail_streak' then coalesce((r->>'rss_fail_streak')::integer, 0) else s.rss_fail_streak end,
        rss_last_ok_at    = case when r ? 'rss_last_ok_at' then (r->>'rss_last_ok_at')::timestamptz else s.rss_last_ok_at end,
        rss_last_error    = case when r ? 'rss_last_error' then r->>'rss_last_error' else s.rss_last_error end,
        last_checked_at   = case when r ? 'last_checked_at' then (r->>'last_checked_at')::timestamptz else s.last_checked_at end,
        last_new_video_at = case when r ? 'last_new_video_at' then (r->>'last_new_video_at')::timestamptz else s.last_new_video_at end,
        og_checked_at     = case when r ? 'og_checked_at' then (r->>'og_checked_at')::timestamptz else s.og_checked_at end,
        og_miss_streak    = case when r ? 'og_miss_streak' then coalesce((r->>'og_miss_streak')::smallint, 0) else s.og_miss_streak end
    from (
        select distinct on ((e.r->>'channel_id')::uuid) e.r
        from jsonb_array_elements(p_rows) with ordinality as e(r, ord)
        order by (e.r->>'channel_id')::uuid, e.ord desc
    ) d(r)
    where s.channel_id = (r->>'channel_id')::uuid;
end;
$$;

-- ───────────── snapshot 指紋（時間量化） ─────────────
-- 與第一版相同範圍／欄位，差別：
--   - 時間邊界用 v_q＝p_now 往下取整到 30 分鐘（UTC 整點、半點）計算：同一個 30 分鐘桶內，資料沒變指紋就不變
--   - ended 的範圍用 v_q − 12 小時（真實範圍 p_since 的超集；多出來的列在 v_q 下 recent 為 true、真實輸出不含，
--     只會讓桶交界多傳一次，不會漏傳）
--   - 回傳的 fingerprint＝「md5@check 時間（epoch 毫秒）」，供 mark 判斷先後
-- p_since 保留在簽章裡（呼叫端不變），不再使用。
create or replace function public.schedule_snapshot_check(p_now timestamptz, p_since timestamptz, p_force_minutes integer)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_q timestamptz := to_timestamp(floor(extract(epoch from p_now) / 1800) * 1800);
    v_today date := (p_now at time zone 'Asia/Taipei')::date;
    v_fp text;
    v_prev text;
    v_at timestamptz;
    v_changed boolean;
begin
    with st as (
        select s.id, s.vtuber_id, s.platform, s.external_id, s.source, s.status,
               s.scheduled_start, s.actual_start, s.actual_end, s.title, s.category,
               s.is_schedule_frame, s.merged_with,
               case when s.status = 'live' then v_q - s.fetched_at > interval '2 hours' end as live_stale,
               case when s.status = 'scheduled' then
                   s.scheduled_start is not null
                   and s.scheduled_start <= v_q + interval '7 days'
                   and s.scheduled_start >= v_q - interval '3 hours'
               end as upcoming,
               case when s.status = 'ended' then
                   s.actual_end is not null
                   and v_q - s.actual_end <= interval '12 hours'
                   and s.actual_end <= v_q + interval '1 hour'
               end as recent
        from public.streams s
        where (s.status in ('scheduled', 'live') and not s.is_schedule_frame)
           or (s.status = 'ended' and s.actual_end >= v_q - interval '12 hours')
    )
    select md5(
        coalesce((select json_agg(json_build_array(
                     id, vtuber_id, platform, external_id, source, status, scheduled_start, actual_start, actual_end,
                     title, category, is_schedule_frame, merged_with, live_stale, upcoming, recent) order by id)::text
                  from st), '') || '|' ||
        coalesce((select json_agg(json_build_array(
                     v.id, v.name, v.img_url, v.nationality, v.group_id, v.youtube_channel_id, v.twitch_channel_id, v.slug)
                     order by v.id)::text
                  from public.vtubers v where v.id in (select vtuber_id from st)), '') || '|' ||
        coalesce((select json_agg(json_build_array(g.id, g.name, g.kind, g.parent_id) order by g.id)::text
                  from public.vtuber_groups g), '') || '|' ||
        coalesce((select json_agg(json_build_array(l.vtuber_id, l.group_id) order by l.vtuber_id, l.group_id)::text
                  from public.vtuber_group_links l
                  where l.role = 'collaborator'
                    and (l.since is null or l.since <= v_today)
                    and (l.until is null or l.until >= v_today)), '') || '|' ||
        coalesce((select c.last_run_at::text from public.cron_shard_state c where c.job_name = 'schedule_heavy_rss'), '')
    )
    into v_fp;

    -- 上次 mark：fingerprint（md5）與 checked_at（mark 對應的 check 時間；舊格式沒有就用 last_run_at）
    select c.last_run_stats->>'fingerprint',
           coalesce((c.last_run_stats->>'checked_at')::timestamptz, c.last_run_at)
      into v_prev, v_at
    from public.cron_shard_state c where c.job_name = 'snapshot';

    v_changed := v_prev is null
        or v_prev <> v_fp
        or v_at is null
        or p_now - v_at >= make_interval(mins => p_force_minutes);
    return json_build_object(
        'changed', v_changed,
        'fingerprint', v_fp || '@' || (floor(extract(epoch from p_now) * 1000))::bigint
    );
end;
$$;

-- mark：p_fingerprint＝check 回傳的「md5@epoch 毫秒」（沒有 @ 的舊格式視為 now() 的 check）。
-- 已經有更晚的 check 記過 → 這次較舊的上傳可能蓋掉了較新的內容：把指紋作廢（下一輪必定重傳），不覆寫時間。
create or replace function public.schedule_snapshot_mark(p_fingerprint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_md5 text := split_part(p_fingerprint, '@', 1);
    v_ms text := split_part(p_fingerprint, '@', 2);
    v_at timestamptz;
    v_prev_at timestamptz;
begin
    v_at := case when v_ms ~ '^[0-9]+$' then to_timestamp(v_ms::bigint / 1000.0) else now() end;
    select coalesce((c.last_run_stats->>'checked_at')::timestamptz, c.last_run_at) into v_prev_at
    from public.cron_shard_state c where c.job_name = 'snapshot' for update;

    if v_prev_at is not null and v_prev_at > v_at then
        update public.cron_shard_state
        set last_run_stats = coalesce(last_run_stats, '{}'::jsonb) - 'fingerprint', updated_at = now()
        where job_name = 'snapshot';
        return;
    end if;

    insert into public.cron_shard_state (job_name, shard_size, last_run_at, last_run_stats, updated_at)
    values ('snapshot', 0, v_at, jsonb_build_object('fingerprint', v_md5, 'checked_at', v_at), now())
    on conflict (job_name) do update
    set last_run_at = excluded.last_run_at,
        last_run_stats = excluded.last_run_stats,
        updated_at = excluded.updated_at;
end;
$$;

-- ───────────── snapshot 來源（欄式） ─────────────
-- 範圍同第一版；場次只帶 buildSnapshot 用得到的欄位（fetched_at 只在直播中列帶，判斷 LIVE_STALE_HOURS 用）。
-- 回傳 {"active": {cols, rows}, "ended": {cols, rows}, "vtubers": {cols, rows}, "groups": {cols, rows}, "links": {cols, rows}}
create or replace function public.schedule_snapshot_source(p_since timestamptz)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_scols constant text := '["id","vtuber_id","platform","external_id","source","status","scheduled_start","actual_start","actual_end","title","category","is_schedule_frame","fetched_at","merged_with"]';
    v_active text;
    v_ended text;
    v_vtubers text;
    v_groups text;
    v_links text;
begin
    with src as (
        select case when s.status = 'ended' then 2 else 1 end as k, s.*
        from public.streams s
        where (s.status in ('scheduled', 'live') and s.is_schedule_frame = false)
           or (s.status = 'ended' and s.actual_end >= p_since)
    ), cells as (
        select r.k, r.id, r.vtuber_id,
               '[' || public.schedule_jcell(r.id) || ',' || public.schedule_jcell(r.vtuber_id) || ',' ||
               public.schedule_jcell(r.platform) || ',' || public.schedule_jcell(r.external_id) || ',' ||
               public.schedule_jcell(r.source) || ',' || public.schedule_jcell(r.status) || ',' ||
               public.schedule_jcell(r.scheduled_start) || ',' || public.schedule_jcell(r.actual_start) || ',' ||
               public.schedule_jcell(r.actual_end) || ',' || public.schedule_jcell(r.title) || ',' ||
               public.schedule_jcell(r.category) || ',' || public.schedule_jcell(r.is_schedule_frame) || ',' ||
               public.schedule_jcell(case when r.status = 'live' then r.fetched_at end) || ',' ||
               public.schedule_jcell(r.merged_with) || ']' as cell
        from src r
    ), used as (
        select distinct vtuber_id from src
    )
    select (select string_agg(c.cell, ',' order by c.id) from cells c where c.k = 1),
           (select string_agg(c.cell, ',' order by c.id) from cells c where c.k = 2),
           (select string_agg('[' || public.schedule_jcell(v.id) || ',' || public.schedule_jcell(v.name) || ',' ||
                              public.schedule_jcell(v.img_url) || ',' || public.schedule_jcell(v.nationality) || ',' ||
                              public.schedule_jcell(v.group_id) || ',' || public.schedule_jcell(v.youtube_channel_id) || ',' ||
                              public.schedule_jcell(v.twitch_channel_id) || ',' || public.schedule_jcell(v.slug) || ']', ',' order by v.id)
              from public.vtubers v where v.id in (select u.vtuber_id from used u)),
           (select string_agg('[' || public.schedule_jcell(l.vtuber_id) || ',' || public.schedule_jcell(l.group_id) || ',' ||
                              public.schedule_jcell(l.since) || ',' || public.schedule_jcell(l.until) || ']', ',' order by l.vtuber_id, l.group_id)
              from public.vtuber_group_links l
              where l.role = 'collaborator' and l.vtuber_id in (select u.vtuber_id from used u))
    into v_active, v_ended, v_vtubers, v_links;

    select string_agg('[' || public.schedule_jcell(g.id) || ',' || public.schedule_jcell(g.name) || ',' ||
                      public.schedule_jcell(g.kind) || ',' || public.schedule_jcell(g.parent_id) || ']', ',' order by g.id)
    into v_groups
    from public.vtuber_groups g;

    return ('{"active":{"cols":' || v_scols || ',"rows":[' || coalesce(v_active, '') || ']}' ||
            ',"ended":{"cols":' || v_scols || ',"rows":[' || coalesce(v_ended, '') || ']}' ||
            ',"vtubers":{"cols":["id","name","img_url","nationality","group_id","youtube_channel_id","twitch_channel_id","slug"],"rows":[' || coalesce(v_vtubers, '') || ']}' ||
            ',"groups":{"cols":["id","name","kind","parent_id"],"rows":[' || coalesce(v_groups, '') || ']}' ||
            ',"links":{"cols":["vtuber_id","group_id","since","until"],"rows":[' || coalesce(v_links, '') || ']}}')::json;
end;
$$;

-- ───────────── 雙平台合併指紋（只看 computeMerges 會用到的列） ─────────────
-- computeMerges（merge.ts）：只處理 status in (scheduled, live, ended)、非常駐框、有開始時間（actual_start ?? scheduled_start）的列，
-- 依 vtuber 分組；ended 只會當主場次、不在輸出裡。所以：
--   - scheduled／live：非常駐框且有開始時間的才算（其餘不在輸出、也不影響別人）
--   - ended（actual_end >= p_ended_since）：同一實況主有上述 scheduled／live、且開始時間相差在合併窗（MERGE_WINDOW_MS＝30 分鐘）內
--     才算——computeMerges 只會把相差 30 分鐘內的場次併進主場次，窗外的 ended 不可能被選中，也不影響其他列是否成為主場次
create or replace function public.schedule_merge_fp(p_ended_since timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    with act as (
        select s.id, s.vtuber_id, s.platform, s.source, s.status, s.scheduled_start, s.actual_start, s.merged_with
        from public.streams s
        where s.status in ('scheduled', 'live')
          and not s.is_schedule_frame
          and coalesce(s.actual_start, s.scheduled_start) is not null
    ), ended as (
        select s.id, s.vtuber_id, s.platform, s.source, s.status, s.scheduled_start, s.actual_start, null::uuid as merged_with
        from public.streams s
        where s.status = 'ended'
          and s.actual_end >= p_ended_since
          and not s.is_schedule_frame
          and exists (
              -- 只有和同一實況主的 scheduled／live 開始時間相差在合併窗（30 分鐘，多留 1 秒避免毫秒捨入）內，ended 才可能被選為主場次
              select 1 from act a
              where a.vtuber_id = s.vtuber_id
                and abs(extract(epoch from coalesce(a.actual_start, a.scheduled_start) - coalesce(s.actual_start, s.scheduled_start))) <= 1801
          )
    ), allr as (
        select * from act union all select * from ended
    )
    select md5(coalesce(json_agg(json_build_array(
               a.id, a.vtuber_id, a.platform, a.source, a.status, a.scheduled_start, a.actual_start, a.merged_with)
               order by a.id)::text, ''))
    from allr a;
$$;

-- check 回傳 fingerprint＝「md5@p_ended_since（epoch 毫秒）」，mark 用同一個 ended 下限重算一次比對
create or replace function public.schedule_merge_check(p_ended_since timestamptz)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_fp text := public.schedule_merge_fp(p_ended_since);
    v_prev text;
begin
    select c.last_run_stats->>'fingerprint' into v_prev
    from public.cron_shard_state c where c.job_name = 'merge';
    return json_build_object(
        'changed', v_prev is null or v_prev <> v_fp,
        'fingerprint', v_fp || '@' || (floor(extract(epoch from p_ended_since) * 1000))::bigint
    );
end;
$$;

-- mark：重算指紋，與 check 時不同（期間有人寫入）就不記——呼叫端驗證「沒有要改的列」的是 check 之後讀到的狀態，
-- 只有狀態沒變時記下來才有意義。舊格式（沒有 @）照第一版直接記。
create or replace function public.schedule_merge_mark(p_fingerprint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_md5 text := split_part(p_fingerprint, '@', 1);
    v_ms text := split_part(p_fingerprint, '@', 2);
begin
    if v_ms ~ '^[0-9]+$' and public.schedule_merge_fp(to_timestamp(v_ms::bigint / 1000.0)) <> v_md5 then
        return;
    end if;
    insert into public.cron_shard_state (job_name, shard_size, last_run_at, last_run_stats, updated_at)
    values ('merge', 0, now(), jsonb_build_object('fingerprint', v_md5), now())
    on conflict (job_name) do update
    set last_run_at = excluded.last_run_at,
        last_run_stats = excluded.last_run_stats,
        updated_at = excluded.updated_at;
end;
$$;

-- ───────────── 權限 ─────────────
revoke all on function public.schedule_jcell(anyelement) from public, anon, authenticated;
revoke all on function public.schedule_roster_v2(text, smallint, uuid[], integer, integer) from public, anon, authenticated;
revoke all on function public.schedule_current_streams(uuid[]) from public, anon, authenticated;
revoke all on function public.schedule_touch_last_live(uuid[], timestamptz) from public, anon, authenticated;
revoke all on function public.schedule_merge_fp(timestamptz) from public, anon, authenticated;
-- create or replace 保留既有權限；再宣告一次保險
revoke all on function public.schedule_upsert_channel_states(jsonb) from public, anon, authenticated;
revoke all on function public.schedule_snapshot_check(timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.schedule_snapshot_mark(text) from public, anon, authenticated;
revoke all on function public.schedule_snapshot_source(timestamptz) from public, anon, authenticated;
revoke all on function public.schedule_merge_check(timestamptz) from public, anon, authenticated;
revoke all on function public.schedule_merge_mark(text) from public, anon, authenticated;

grant execute on function public.schedule_jcell(anyelement) to service_role;
grant execute on function public.schedule_roster_v2(text, smallint, uuid[], integer, integer) to service_role;
grant execute on function public.schedule_current_streams(uuid[]) to service_role;
grant execute on function public.schedule_touch_last_live(uuid[], timestamptz) to service_role;
grant execute on function public.schedule_merge_fp(timestamptz) to service_role;
grant execute on function public.schedule_upsert_channel_states(jsonb) to service_role;
grant execute on function public.schedule_snapshot_check(timestamptz, timestamptz, integer) to service_role;
grant execute on function public.schedule_snapshot_mark(text) to service_role;
grant execute on function public.schedule_snapshot_source(timestamptz) to service_role;
grant execute on function public.schedule_merge_check(timestamptz) to service_role;
grant execute on function public.schedule_merge_mark(text) to service_role;

-- 部署限制：snapshot_source 改成欄式輸出，c7bf0209 版的函式讀不懂（每輪 500）。
--   上線時本檔與 20261009010442 一起套，三支函式直接部署本版；不可讓 c7bf0209 版函式與本檔並存。
--   最簡單的整體回滾是把三支函式退回 47925331（不呼叫任何新 RPC），migration 可以留著。
-- 回滾到 c7bf0209（Edge Functions 要先退回 c7bf0209 版，且下面步驟必須做完）：
--   重新套 20261009010442_schedule_rpc_egress.sql（create or replace 會把 upsert_channel_states、snapshot_check／mark／source、
--   merge_check／mark 換回第一版），再：
--   drop function if exists public.schedule_roster_v2(text, smallint, uuid[], integer, integer);
--   drop function if exists public.schedule_current_streams(uuid[]);
--   drop function if exists public.schedule_touch_last_live(uuid[], timestamptz);
--   drop function if exists public.schedule_merge_fp(timestamptz);
--   drop function if exists public.schedule_jcell(anyelement);
--   update public.cron_shard_state set last_run_stats = last_run_stats - 'fingerprint' where job_name in ('snapshot', 'merge');
