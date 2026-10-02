-- 核准投稿時寫入 Twitch broadcaster id
--
-- 問題：20261001110000 的 approve_vtuber_contribution 新增 Twitch 帳號時 external_id 一律為 null，
-- 而週表的直播中（/helix/streams）與週表（/helix/schedule）都靠 external_id；正式站沒有任何流程會補，
-- 經投稿核准的 Twitch 帳號永遠不會被週表追蹤。
-- 修正：後台 API（functions/api/admin/contributions.js）先用 helix/users 查好 id，以 p_overrides.twitch_id 傳入；
-- 這裡寫進 external_id（verified = true），也用 id 檢查是否已屬於別人（帳號改名後 login 對不上、id 仍相同）。
-- 只改函式本體，簽章不變；其餘行為與 20261001110000 相同。新增錯誤碼 invalid_twitch_id（id 非數字或沒有 login）。
--
-- 回滾：重新執行 20261001110000_vtuber_submissions.sql 第 5 段的 create or replace function（及其 revoke／grant）。

-- p_overrides 另有 twitch_id（只能由後台 API 設定，見檔頭）。
create or replace function public.approve_vtuber_contribution(p_id uuid, p_overrides jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    c public.vtuber_contributions%rowtype;
    p jsonb;
    yt text;
    v_name text;
    v_group uuid;
    v_vt uuid;
    v_slug text;
    v_handle text;
    v_twitch text;
    v_twitch_id text;
begin
    select * into c from public.vtuber_contributions where id = p_id for update;
    if not found then
        raise exception 'not_found' using errcode = 'P0002';
    end if;
    if c.status <> 'pending' then
        raise exception 'not_pending' using errcode = 'P0001';
    end if;
    if c.action <> 'add' then
        raise exception 'unsupported_action' using errcode = 'P0001';
    end if;

    p := c.payload || coalesce(p_overrides, '{}'::jsonb) - 'reviewer_notes';
    yt := coalesce(c.youtube_channel_id, p ->> 'youtube_channel_id');
    v_name := nullif(btrim(p ->> 'name'), '');
    if v_name is null or char_length(v_name) > 100 then
        raise exception 'invalid_name' using errcode = '22023';
    end if;

    if yt is not null and (
        exists (select 1 from public.vtubers where youtube_channel_id = yt)
        or exists (select 1 from public.vtuber_channels where platform = 'youtube' and external_id = yt and status = 'active')
    ) then
        raise exception 'exists' using errcode = '23505';
    end if;

    v_twitch := nullif(lower(btrim(p ->> 'twitch_login')), '');
    -- broadcaster id 只信任後台 API 查好放進 overrides 的值（不讀投稿 payload）
    v_twitch_id := nullif(btrim(coalesce(p_overrides, '{}'::jsonb) ->> 'twitch_id'), '');
    if v_twitch_id is not null and (v_twitch is null or v_twitch_id !~ '^[0-9]{1,20}$') then
        raise exception 'invalid_twitch_id' using errcode = '22023';
    end if;
    -- Twitch 帳號已屬於別人：不能再掛一次（否則會搶走對方的 slug，日後補 Twitch ID 也會撞唯一索引）
    if v_twitch is not null and (
        exists (select 1 from public.vtubers where lower(twitch_channel_id) = v_twitch)
        or exists (select 1 from public.vtuber_channels where platform = 'twitch' and status = 'active'
                   and (lower(handle) = v_twitch or external_id = v_twitch_id))
    ) then
        raise exception 'twitch_exists' using errcode = '23505';
    end if;

    -- 所屬：既有團體、新建團體、投稿填的名稱（只對既有團體），或個人勢（null）
    if coalesce(p ->> 'affiliation_type', '') = 'personal' and coalesce(p_overrides, '{}'::jsonb) ? 'affiliation_type' then
        v_group := null; -- 審核者明確改成個人勢
    elsif nullif(p ->> 'group_id', '') is not null then
        select id into v_group from public.vtuber_groups where id = (p ->> 'group_id')::uuid;
        if v_group is null then
            raise exception 'group_not_found' using errcode = 'P0002';
        end if;
    elsif nullif(btrim(p -> 'new_group' ->> 'name'), '') is not null then
        if exists (select 1 from public.vtuber_groups where lower(btrim(name)) = lower(btrim(p -> 'new_group' ->> 'name'))) then
            raise exception 'group_exists' using errcode = '23505';
        end if;
        insert into public.vtuber_groups (name, kind, nationality)
        values (
            btrim(p -> 'new_group' ->> 'name'),
            coalesce(nullif(p -> 'new_group' ->> 'kind', ''), 'unverified'),
            nullif(p -> 'new_group' ->> 'nationality', '')
        )
        returning id into v_group;
    elsif nullif(btrim(p ->> 'group_name'), '') is not null and coalesce(p ->> 'affiliation_type', 'personal') <> 'personal' then
        select id into v_group from public.vtuber_groups
        where lower(btrim(name)) = lower(btrim(p ->> 'group_name'))
        order by (parent_id is null) desc
        limit 1;
        if v_group is null then
            raise exception 'group_unresolved' using errcode = 'P0001';
        end if;
    end if;

    -- YouTube 頻道快取：讓 slug 能用頻道 handle（schedule_slug_candidate 讀這張表）
    v_handle := nullif(lower(regexp_replace(coalesce(p ->> 'handle', ''), '^@', '')), '');
    if yt is not null then
        insert into public.youtube_channels (channel_id, channel_title, thumbnail_url, custom_url)
        values (yt, v_name, nullif(p ->> 'avatar_url', ''), case when v_handle is null then null else '@' || v_handle end)
        on conflict (channel_id) do update
            set custom_url = coalesce(public.youtube_channels.custom_url, excluded.custom_url),
                thumbnail_url = coalesce(public.youtube_channels.thumbnail_url, excluded.thumbnail_url);
    end if;

    insert into public.vtubers (
        name, img_url, nationality, group_id, youtube_channel_id, twitch_channel_id,
        channel_id_verified, contributed_by, bio, x_url, facebook_url, instagram_url, activity
    ) values (
        v_name,
        nullif(p ->> 'avatar_url', ''),
        coalesce(nullif(p ->> 'nationality', ''), 'OTHER'),
        v_group,
        yt,
        v_twitch,
        yt is not null,
        'contribution:' || c.id::text,
        nullif(p ->> 'bio', ''),
        nullif(p ->> 'x_url', ''),
        nullif(p ->> 'facebook_url', ''),
        nullif(p ->> 'instagram_url', ''),
        'active'
    )
    returning id, slug into v_vt, v_slug;

    if yt is not null then
        insert into public.vtuber_channels (vtuber_id, platform, external_id, handle, display_name, verified, status)
        values (v_vt, 'youtube', yt, coalesce(v_handle, yt), v_name, true, 'active');
    end if;
    -- Twitch：後台 API 已用 helix/users 查好 broadcaster id，週表下一輪就會追蹤
    -- （沒帶 id 時仍只記 login，舊行為；要等 backfill 補 id）
    if v_twitch is not null then
        insert into public.vtuber_channels (vtuber_id, platform, external_id, handle, display_name, verified, status)
        values (v_vt, 'twitch', v_twitch_id, v_twitch, v_name, v_twitch_id is not null, 'active');
    end if;

    update public.vtuber_contributions
    set status = 'approved',
        target_vtuber_id = v_vt,
        reviewed_at = now(),
        reviewer_notes = nullif(left(coalesce(p_overrides ->> 'reviewer_notes', ''), 500), '')
    where id = p_id;

    insert into public.admin_actions (admin_user_id, actor, action_type, target_id, decision, before_status, after_status, metadata)
    values (null, 'admin_token', 'review_vtuber_contribution', p_id, 'approve', 'pending', 'approved',
            jsonb_build_object('vtuber_id', v_vt, 'slug', v_slug));

    return jsonb_build_object('vtuber_id', v_vt, 'slug', v_slug);
end;
$$;

revoke all on function public.approve_vtuber_contribution(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.approve_vtuber_contribution(uuid, jsonb) to service_role;
