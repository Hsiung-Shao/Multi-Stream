-- 雙平台合併改在資料庫內算（2026-11-10，出口流量第二輪降載）。
-- 原本 applyMerges 每輪經 REST 讀回全部 scheduled／live 場次（約 470KB），在 Edge Function 算 merge.ts 再寫回；
-- 現在一支 RPC 在資料庫內算完、直接寫入，只回傳筆數與有變的列。merge.ts 已刪除，規則唯一來源在這裡。
--
-- 規則（Docs 業務規則「雙平台合併」＋使用者 2026-09-29 裁定）：
--   同一位實況主、開始時間（actual_start，沒有用 scheduled_start）相差 ≤ 30 分鐘的兩場視為同一場。
--   主場次先看狀態：live > ended > scheduled；同狀態再看來源：YouTube > Twitch 直播 > Twitch 週表 > 其他 > 社群週表／投稿。
--   可合併：YouTube × Twitch（任一來源）、Twitch 週表併入 Twitch 直播、社群週表／投稿併入任何真實場次；
--   同平台同來源不合併；兩個社群／投稿彼此不合併。ended 只當主場次、不寫入。
--   時間未定（time_tbd）的社群／投稿列：只併同一台北日期、開始時間不早於發文時間（announced_at，沒有用 created_at）的主場次，
--   選同日離 00:00 最近的一場；同一來源鍵（external_id 去掉最後的 :n）同一台北日期已有具體時間列（不論狀態）時不參與合併。
--   時間未定列選到的主場次已 ended → 直接過期（否則主場次移出讀取窗後 tbd 會重新冒出來）。
-- 讀取範圍要與 schedule_merge_fp（20261014001114）一致；改規則或範圍時兩邊一起改。
--
-- 回滾：drop function public.schedule_merge_apply(timestamptz, timestamptz, boolean);
--       Edge Function 退回 802378e4（applyMerges 用 merge.ts）。

create or replace function public.schedule_merge_apply(p_ended_since timestamptz, p_since timestamptz, p_dry_run boolean default false)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    s record;
    v_vtuber uuid := null;
    -- 目前這位實況主的主場次（平行陣列）
    p_id uuid[]; p_rnk int[]; p_st timestamptz[]; p_platform text[]; p_source text[]; p_day date[];
    v_best uuid; v_best_gap double precision; v_gap double precision; v_since timestamptz;
    i int;
    v_changed int := 0;
    v_expired int := 0;
    v_changes json;
    v_expire json;
begin
    drop table if exists pg_temp._merge_in;
    drop table if exists pg_temp._merge_out;

    create temp table _merge_in on commit drop as
    with raw as (
        select x.id, x.vtuber_id, x.platform, x.source, x.status, x.is_schedule_frame, x.merged_with,
               coalesce(x.time_tbd, false) as time_tbd, x.announced_at, x.created_at, x.external_id,
               coalesce(x.actual_start, x.scheduled_start) as st
        from public.streams x
        where (x.status in ('scheduled', 'live') and not x.is_schedule_frame)
           or (x.status = 'ended' and x.actual_end >= p_ended_since)
           or (x.status = 'expired' and x.source in ('community_post', 'user_submission')
               and not coalesce(x.time_tbd, false) and x.scheduled_start >= p_since)
    )
    select r.*,
           (r.st at time zone 'Asia/Taipei')::date as day,
           substring(r.external_id from '^((?:post|sub):.+):\d+$') as srckey,
           (r.time_tbd and r.source in ('community_post', 'user_submission')) as tbd,
           case r.status when 'live' then 0 when 'ended' then 1 when 'scheduled' then 2 else 9 end * 10
             + case when r.source in ('community_post', 'user_submission') then 4
                    when r.platform = 'youtube' then 0
                    when r.source = 'twitch_live' then 1
                    when r.source = 'twitch_schedule' then 2
                    else 3 end as rnk
    from raw r;

    create temp table _merge_out (id uuid primary key, want uuid) on commit drop;

    for s in
        select m.*,
               (m.tbd and m.srckey is not null and exists (
                   select 1 from pg_temp._merge_in t
                   where t.srckey = m.srckey and not t.time_tbd and t.st is not null and t.day = m.day)) as blocked
        from pg_temp._merge_in m
        where m.status in ('live', 'ended', 'scheduled') and not m.is_schedule_frame and m.st is not null
        order by m.vtuber_id, m.rnk, m.st, m.id
    loop
        if v_vtuber is distinct from s.vtuber_id then
            v_vtuber := s.vtuber_id;
            p_id := '{}'; p_rnk := '{}'; p_st := '{}'; p_platform := '{}'; p_source := '{}'; p_day := '{}';
        end if;

        if s.status = 'ended' then
            p_id := p_id || s.id; p_rnk := p_rnk || s.rnk; p_st := p_st || s.st;
            p_platform := p_platform || s.platform; p_source := p_source || s.source; p_day := p_day || s.day;
            continue;
        end if;

        if s.blocked then
            insert into pg_temp._merge_out values (s.id, null);
            continue;
        end if;

        v_best := null;
        v_best_gap := 'Infinity';
        v_since := coalesce(s.announced_at, s.created_at);
        for i in 1 .. coalesce(array_length(p_id, 1), 0) loop
            if p_rnk[i] >= s.rnk then continue; end if;
            -- canMerge
            if s.source in ('community_post', 'user_submission') then
                if p_source[i] in ('community_post', 'user_submission') then continue; end if;
            elsif p_source[i] in ('community_post', 'user_submission') then
                continue;
            elsif p_platform[i] = s.platform
                  and not (p_source[i] = 'twitch_live' and s.source = 'twitch_schedule') then
                continue;
            end if;
            -- 時間未定列只由發文後才開始的場次兌現
            if s.tbd and v_since is not null and p_st[i] < v_since then continue; end if;
            v_gap := abs(extract(epoch from p_st[i] - s.st));
            if s.tbd then
                if p_day[i] <> s.day then continue; end if;
            elsif v_gap > 1800 then
                continue;
            end if;
            if v_gap < v_best_gap then
                v_best := p_id[i];
                v_best_gap := v_gap;
            end if;
        end loop;

        insert into pg_temp._merge_out values (s.id, v_best);
        if v_best is null then
            p_id := p_id || s.id; p_rnk := p_rnk || s.rnk; p_st := p_st || s.st;
            p_platform := p_platform || s.platform; p_source := p_source || s.source; p_day := p_day || s.day;
        end if;
    end loop;

    select coalesce(json_agg(json_build_object('id', o.id, 'merged_with', o.want) order by o.id), '[]'::json)
      into v_changes
      from pg_temp._merge_out o join pg_temp._merge_in m on m.id = o.id
     where m.merged_with is distinct from o.want;

    select coalesce(json_agg(o.id order by o.id), '[]'::json)
      into v_expire
      from pg_temp._merge_out o
      join pg_temp._merge_in m on m.id = o.id
      join pg_temp._merge_in p on p.id = o.want
     where m.tbd and m.status = 'scheduled' and p.status = 'ended';

    if not p_dry_run then
        update public.streams st
           set merged_with = o.want
          from pg_temp._merge_out o join pg_temp._merge_in m on m.id = o.id
         where st.id = o.id and m.merged_with is distinct from o.want;
        get diagnostics v_changed = row_count;

        update public.streams st
           set status = 'expired', fetched_at = now()
         where st.status = 'scheduled'
           and st.id in (select (x #>> '{}')::uuid from json_array_elements(v_expire) x);
        get diagnostics v_expired = row_count;
    else
        v_changed := json_array_length(v_changes);
        v_expired := json_array_length(v_expire);
    end if;

    -- 列清單只在 dry-run 回傳（上線前對照用）；正式執行只回筆數，省出口流量
    if p_dry_run then
        return json_build_object('changed', v_changed, 'expired', v_expired, 'changes', v_changes, 'expire', v_expire);
    end if;
    return json_build_object('changed', v_changed, 'expired', v_expired);
end;
$$;

revoke all on function public.schedule_merge_apply(timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.schedule_merge_apply(timestamptz, timestamptz, boolean) to service_role;
