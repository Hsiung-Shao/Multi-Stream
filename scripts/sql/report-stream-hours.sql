-- 資料報告〈台灣 VTuber 幾點開台〉快照（唯讀）。
-- 用法：對正式庫執行，回傳單一 JSON 欄 → 原樣存成 src/data/reports/stream-hours-<YYYY-MM>.json。
-- 口徑：已結束、未被合併、非週表框；台灣籍（vtubers.nationality='TW'）；依台北時間；期間 [from, to)。
-- 企業勢＝與週表篩選同一規則（src/features/schedule/filters.ts matchesAgency）：所屬團體 kind='agency'，
-- 或目前有效的合作藝人連結到 agency；以快照當下的所屬判定，不追溯期間內轉籍。
with params as (
  select timestamptz '2026-10-01 00:00+08' as d_from, timestamptz '2026-11-25 00:00+08' as d_to
), s as (
  select s.platform,
         (s.actual_start at time zone 'Asia/Taipei') as t,
         extract(epoch from s.actual_end - s.actual_start) / 3600.0 as h,
         s.category, s.vtuber_id,
         coalesce(g.kind = 'agency', false) or exists (
           select 1 from vtuber_group_links l join vtuber_groups lg on lg.id = l.group_id
           where l.vtuber_id = v.id and l.role = 'collaborator' and lg.kind = 'agency'
             and (l.since is null or l.since <= now()) and (l.until is null or l.until > now())
         ) as corp
  from streams s
  join vtubers v on v.id = s.vtuber_id
  left join vtuber_groups g on g.id = v.group_id, params p
  where s.status = 'ended' and s.merged_with is null and coalesce(s.is_schedule_frame, false) = false
    and s.actual_start is not null and s.actual_end is not null and s.actual_end > s.actual_start
    and v.nationality = 'TW'
    and s.actual_start >= p.d_from and s.actual_start < p.d_to
), b as (
  select *, extract(hour from t)::int as hr, extract(isodow from t)::int as dow,
         case when h < 1 then 0 when h < 2 then 1 when h < 3 then 2 when h < 4 then 3
              when h < 6 then 4 when h < 8 then 5 else 6 end as dur_bin
  from s
)
select json_build_object(
  'period', json_build_object('from', '2026-10-01', 'to', '2026-11-24', 'timezone', 'Asia/Taipei'),
  'generatedAt', to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD'),
  'totalStreams', (select count(*) from b),
  'vtubers', (select count(distinct vtuber_id) from b),
  'byPlatform', (select json_object_agg(platform, n) from (select platform, count(*) n from b group by 1) x),
  'byHour', (select json_agg(coalesce(n, 0) order by g) from generate_series(0, 23) g
             left join (select hr, count(*) n from b group by 1) x on x.hr = g),
  -- byDowHour[0]＝週一 … [6]＝週日，每列 24 格
  'byDowHour', (select json_agg(row order by d) from (
      select d, json_agg(coalesce(n, 0) order by g) as row
      from generate_series(1, 7) d cross join generate_series(0, 23) g
      left join (select dow, hr, count(*) n from b group by 1, 2) x on x.dow = d and x.hr = g
      group by d) y),
  -- 分組上界（小時）：<1, 1–2, 2–3, 3–4, 4–6, 6–8, ≥8
  'durationBins', (select json_agg(coalesce(n, 0) order by g) from generate_series(0, 6) g
                   left join (select dur_bin, count(*) n from b group by 1) x on x.dur_bin = g),
  'medianHours', (select json_object_agg(k, m) from (
      select platform as k, round(percentile_cont(0.5) within group (order by h)::numeric, 2) m from b group by 1
      union all select 'all', round(percentile_cont(0.5) within group (order by h)::numeric, 2) from b) x),
  'segments', (select json_object_agg(k, o) from (
      select case when corp then 'corporate' else 'independent' end k,
             json_build_object(
               'streams', count(*),
               'vtubers', count(distinct vtuber_id),
               'medianHours', round(percentile_cont(0.5) within group (order by h)::numeric, 2),
               'byHour', (select json_agg(coalesce(n, 0) order by g) from generate_series(0, 23) g
                          left join (select hr, count(*) n from b b2 where b2.corp = b1.corp group by 1) x on x.hr = g)
             ) o
      from b b1 group by corp) z),
  'twitchTopCategories', (select json_agg(json_build_object('name', category, 'streams', n) order by n desc) from (
      select category, count(*) n from b where platform = 'twitch' and coalesce(category, '') <> ''
      group by 1 order by 2 desc limit 10) x),
  'twitchWithCategory', (select count(*) from b where platform = 'twitch' and coalesce(category, '') <> '')
) as report;
