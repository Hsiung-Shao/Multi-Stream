-- 資料回報「補充資料」（2026-10-02）：使用者在個人頁回報時可補上缺的社群連結、頻道與簡介，後台一鍵套用。
--
-- 1. vtuber_reports.reasons 白名單加 add_info（補充的內容存在建表時預留的 suggested jsonb）。
-- 2. apply_vtuber_report_info：後台套用補充資料（單一交易）。
--    - 社群（x_url／facebook_url／instagram_url）與簡介：覆寫 vtubers（vtubers 的 CHECK 是最後一道防線）。
--    - YouTube／Twitch 只「補缺」：這位 VTuber 已有頻道就拒絕（換頻道仍走一般回報＋人工處理），
--      頻道已屬於別人也拒絕。值由後台 API 先查好（YouTube 讀頻道頁取得 channelId，Twitch 用 helix/users 取得 id），
--      Twitch 直接寫入 broadcaster id，週表下一輪就會追蹤，不必等本地 backfill。
--    - 回報改為 resolved，admin_actions 記錄修改前後的值（decision=approve、metadata.kind=apply_info、metadata.before／after；decision 的 CHECK 沒有 apply），單筆還原依 before 寫回。
--    只給 service_role 執行（後台 API 呼叫）。
--
-- p_fields 可用的 key（都可省略；值已在後台 API 正規化）：
--   x_url, facebook_url, instagram_url, bio（字串；空字串＝清空）
--   youtube {channel_id, title, avatar_url, handle}
--   twitch  {login, id, display_name}
-- 錯誤以 exception 回報：not_found／not_open／no_target／no_fields／youtube_already_set／exists／
--   twitch_already_set／twitch_exists／invalid_field。
--
-- 回滾：
--   drop function if exists public.apply_vtuber_report_info(uuid, jsonb, text);
--   alter table public.vtuber_reports drop constraint vtuber_reports_reasons_check,
--     add constraint vtuber_reports_reasons_check check (
--       array_length(reasons, 1) is null or (array_length(reasons, 1) <= 8 and reasons <@ array[
--         'name', 'group', 'nationality', 'graduated', 'channel_link', 'wrong_time', 'cancelled', 'duplicate',
--         'not_vtuber', 'missing_member', 'wrong_member', 'other']));
--   （回滾 CHECK 前，先把含 add_info 的回報的 reasons 移除 add_info，否則加回約束會失敗）
-- 單筆套用的還原：admin_actions.metadata.before（admin_actions 有 180 天清理排程，超過就只剩資料本身）。
--   YouTube 補缺另外新增了 vtuber_channels 列與 youtube_channels 快取列，還原時一併移除（快取列無害，可保留）。

-- 1. 原因白名單
alter table public.vtuber_reports drop constraint vtuber_reports_reasons_check;
alter table public.vtuber_reports add constraint vtuber_reports_reasons_check check (
    array_length(reasons, 1) is null
    or (array_length(reasons, 1) <= 8 and reasons <@ array[
        'name', 'group', 'nationality', 'graduated', 'channel_link',
        'wrong_time', 'cancelled', 'duplicate', 'not_vtuber',
        'missing_member', 'wrong_member', 'add_info', 'other'
    ])
);

-- 2. 套用補充資料
create or replace function public.apply_vtuber_report_info(p_id uuid, p_fields jsonb, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    r public.vtuber_reports%rowtype;
    v public.vtubers%rowtype;
    f jsonb := coalesce(p_fields, '{}'::jsonb);
    k text;
    applied text[] := '{}';
    before_v jsonb := '{}'::jsonb;
    after_v jsonb := '{}'::jsonb;
    yt text;
    tw_login text;
    tw_id text;
    v_handle text;
begin
    if jsonb_typeof(f) <> 'object' then
        raise exception 'invalid_field' using errcode = '22023';
    end if;

    select * into r from public.vtuber_reports where id = p_id for update;
    if not found then
        raise exception 'not_found' using errcode = 'P0002';
    end if;
    if r.status <> 'open' then
        raise exception 'not_open' using errcode = 'P0001';
    end if;
    if r.vtuber_id is null then
        raise exception 'no_target' using errcode = 'P0001';
    end if;
    select * into v from public.vtubers where id = r.vtuber_id for update;
    if not found then
        raise exception 'no_target' using errcode = 'P0001';
    end if;

    -- 社群與簡介：覆寫（空字串＝清空）
    foreach k in array array['x_url', 'facebook_url', 'instagram_url', 'bio'] loop
        continue when not f ? k;
        if jsonb_typeof(f -> k) not in ('string', 'null') then
            raise exception 'invalid_field' using errcode = '22023';
        end if;
        before_v := before_v || jsonb_build_object(k, to_jsonb(v) -> k);
        after_v := after_v || jsonb_build_object(k, nullif(btrim(f ->> k), ''));
        applied := applied || k;
    end loop;
    if after_v <> '{}'::jsonb then
        update public.vtubers set
            x_url = case when after_v ? 'x_url' then after_v ->> 'x_url' else x_url end,
            facebook_url = case when after_v ? 'facebook_url' then after_v ->> 'facebook_url' else facebook_url end,
            instagram_url = case when after_v ? 'instagram_url' then after_v ->> 'instagram_url' else instagram_url end,
            bio = case when after_v ? 'bio' then after_v ->> 'bio' else bio end
        where id = v.id;
    end if;

    -- YouTube：只補缺
    if jsonb_typeof(f -> 'youtube') = 'object' then
        yt := nullif(btrim(f -> 'youtube' ->> 'channel_id'), '');
        if yt is null or yt !~ '^UC[A-Za-z0-9_-]{22}$' then
            raise exception 'invalid_field' using errcode = '22023';
        end if;
        if v.youtube_channel_id is not null
           or exists (select 1 from public.vtuber_channels where vtuber_id = v.id and platform = 'youtube' and status = 'active') then
            raise exception 'youtube_already_set' using errcode = 'P0001';
        end if;
        if exists (select 1 from public.vtubers where youtube_channel_id = yt)
           or exists (select 1 from public.vtuber_channels where platform = 'youtube' and external_id = yt and status = 'active') then
            raise exception 'exists' using errcode = '23505';
        end if;
        v_handle := nullif(lower(regexp_replace(coalesce(f -> 'youtube' ->> 'handle', ''), '^@', '')), '');
        insert into public.youtube_channels (channel_id, channel_title, thumbnail_url, custom_url)
        values (
            yt,
            coalesce(nullif(left(btrim(f -> 'youtube' ->> 'title'), 200), ''), v.name),
            nullif(f -> 'youtube' ->> 'avatar_url', ''),
            case when v_handle is null then null else '@' || v_handle end
        )
        on conflict (channel_id) do update
            set custom_url = coalesce(public.youtube_channels.custom_url, excluded.custom_url),
                thumbnail_url = coalesce(public.youtube_channels.thumbnail_url, excluded.thumbnail_url);
        update public.vtubers set youtube_channel_id = yt, channel_id_verified = true where id = v.id;
        insert into public.vtuber_channels (vtuber_id, platform, external_id, handle, display_name, verified, status)
        values (v.id, 'youtube', yt, coalesce(v_handle, yt), v.name, true, 'active');
        before_v := before_v || jsonb_build_object('youtube_channel_id', null, 'channel_id_verified', v.channel_id_verified);
        after_v := after_v || jsonb_build_object('youtube_channel_id', yt);
        applied := applied || 'youtube'::text;
    end if;

    -- Twitch：只補缺；id 由後台 API 用 helix/users 查好
    if jsonb_typeof(f -> 'twitch') = 'object' then
        tw_login := nullif(lower(btrim(f -> 'twitch' ->> 'login')), '');
        tw_id := nullif(btrim(f -> 'twitch' ->> 'id'), '');
        if tw_login is null or tw_login !~ '^[a-z0-9_]{3,25}$' or tw_id is null or tw_id !~ '^\d{1,20}$' then
            raise exception 'invalid_field' using errcode = '22023';
        end if;
        -- 已有 Twitch：vtuber_channels 有 active 列，或舊欄位 twitch_channel_id 已是別的帳號（同一個 login 允許補上 id）
        if exists (select 1 from public.vtuber_channels where vtuber_id = v.id and platform = 'twitch' and status = 'active')
           or (v.twitch_channel_id is not null and lower(v.twitch_channel_id) <> tw_login) then
            raise exception 'twitch_already_set' using errcode = 'P0001';
        end if;
        if exists (select 1 from public.vtubers where id <> v.id and lower(twitch_channel_id) = tw_login)
           or exists (select 1 from public.vtuber_channels
                      where platform = 'twitch' and status = 'active' and (external_id = tw_id or lower(handle) = tw_login)) then
            raise exception 'twitch_exists' using errcode = '23505';
        end if;
        insert into public.vtuber_channels (vtuber_id, platform, external_id, handle, display_name, verified, status)
        values (v.id, 'twitch', tw_id, tw_login, coalesce(nullif(left(btrim(f -> 'twitch' ->> 'display_name'), 100), ''), v.name), true, 'active');
        before_v := before_v || jsonb_build_object('twitch_channel_id', v.twitch_channel_id);
        if v.twitch_channel_id is null then
            update public.vtubers set twitch_channel_id = tw_login where id = v.id;
        end if;
        after_v := after_v || jsonb_build_object('twitch_channel_id', coalesce(v.twitch_channel_id, tw_login), 'twitch_id', tw_id);
        applied := applied || 'twitch'::text;
    end if;

    if cardinality(applied) = 0 then
        raise exception 'no_fields' using errcode = '22023';
    end if;

    update public.vtuber_reports
    set status = 'resolved',
        resolved_at = now(),
        admin_notes = nullif(left(btrim(coalesce(p_notes, '')), 1000), '')
    where id = p_id;

    insert into public.admin_actions (admin_user_id, actor, action_type, target_id, decision, before_status, after_status, notes, metadata)
    values (null, 'admin_token', 'review_vtuber_report', p_id, 'approve', 'open', 'resolved',
            nullif(left(btrim(coalesce(p_notes, '')), 500), ''),
            jsonb_build_object('kind', 'apply_info', 'vtuber_id', v.id, 'applied', to_jsonb(applied), 'before', before_v, 'after', after_v));

    return jsonb_build_object('vtuber_id', v.id, 'slug', v.slug, 'applied', to_jsonb(applied));
end;
$$;

revoke all on function public.apply_vtuber_report_info(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_vtuber_report_info(uuid, jsonb, text) to service_role;
