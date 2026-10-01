-- VTuber 投稿（2026-10-01）：使用者匿名投稿新 VTuber → vtuber_contributions（pending）→ 後台核准才寫進 vtubers。
--
-- 1. vtubers 加投稿表單收的欄位：簡介與 X／Facebook／Instagram（Twitch 沿用 twitch_channel_id）。
--    網址格式由 functions/lib/vtuber-submit.js 正規化；這裡的 CHECK 是最後一道防線（只收 https、限定網域）。
-- 2. slug 保留字：投稿頁是 /schedule/submit，個人頁是 /schedule/<slug>，slug 不能是 submit／report。
-- 3. vtuber_contributions 加 youtube_channel_id（查重）與 ip_hash（只存加鹽雜湊，不存原始 IP）；
--    同一頻道只能有一筆待審。
-- 4. admin_actions：後台 API 用 ADMIN_API_TOKEN 驗證，拿不到 user id → admin_user_id 改可為 null，另記 actor。
-- 5. approve_vtuber_contribution：核准在單一交易裡完成（建公司→vtubers→vtuber_channels→投稿狀態→稽核），
--    中途失敗整筆回滾，不會留下半成品。只給 service_role 執行（後台 API 呼叫）。
--
-- 回滾（2026-10-01 本地實際跑過：套用→回滾→重套）：
--   drop function if exists public.approve_vtuber_contribution(uuid, jsonb);
--   drop index if exists public.vtuber_contributions_pending_channel_uq;
--   drop index if exists public.vtuber_contributions_status_created_idx;
--   alter table public.vtuber_contributions drop constraint if exists vtuber_contributions_youtube_channel_id_format,
--     drop constraint if exists vtuber_contributions_ip_hash_len;
--   alter table public.vtuber_contributions drop column if exists youtube_channel_id, drop column if exists ip_hash;
--   alter table public.vtubers drop constraint if exists vtubers_slug_reserved, drop constraint if exists vtubers_bio_len,
--     drop constraint if exists vtubers_x_url_format, drop constraint if exists vtubers_facebook_url_format,
--     drop constraint if exists vtubers_instagram_url_format;
--   alter table public.vtubers drop column if exists bio, drop column if exists x_url,
--     drop column if exists facebook_url, drop column if exists instagram_url;
--   （vtubers_assign_slug 還原成 20260929100000_schedule_stage2.sql 的版本）
--   delete from public.admin_actions where admin_user_id is null;
--   alter table public.admin_actions alter column admin_user_id set not null;
--   alter table public.admin_actions drop constraint if exists admin_actions_actor_len, drop column if exists actor;
--   alter table public.admin_actions drop constraint admin_actions_action_type_check,
--     add constraint admin_actions_action_type_check check (action_type = any (array['review_vtuber_contribution','review_vtuber_event','ban_user','other']));

-- 1. vtubers 新欄位
alter table public.vtubers
    add column if not exists bio text,
    add column if not exists x_url text,
    add column if not exists facebook_url text,
    add column if not exists instagram_url text;

alter table public.vtubers
    add constraint vtubers_bio_len check (bio is null or char_length(bio) <= 500),
    add constraint vtubers_x_url_format check (
        x_url is null or (char_length(x_url) <= 2048 and x_url ~* '^https://(www\.|mobile\.)?(x|twitter)\.com/[A-Za-z0-9_]{1,15}/?$')
    ),
    add constraint vtubers_facebook_url_format check (
        facebook_url is null or (char_length(facebook_url) <= 2048 and facebook_url ~* '^https://(www\.|m\.)?(facebook|fb)\.com/[^\s]+$')
    ),
    add constraint vtubers_instagram_url_format check (
        instagram_url is null or (char_length(instagram_url) <= 2048 and instagram_url ~* '^https://(www\.)?instagram\.com/[A-Za-z0-9_.]{1,30}/?$')
    );

comment on column public.vtubers.bio is '簡介（投稿表單，≤500 字）';
comment on column public.vtubers.x_url is 'X（Twitter）個人頁網址';

-- 2. slug 保留字
alter table public.vtubers add constraint vtubers_slug_reserved check (slug is null or slug not in ('submit', 'report'));

create or replace function public.vtubers_assign_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    base text;
    candidate text;
    n int := 1;
begin
    if new.slug is not null then
        return new;
    end if;
    base := public.schedule_slug_candidate(new.id, new.youtube_channel_id, new.twitch_channel_id);
    candidate := base;
    -- 已被使用或是保留字（/schedule/submit、/schedule/report 是頁面）就加序號
    while candidate in ('submit', 'report') or exists (select 1 from public.vtubers where slug = candidate) loop
        n := n + 1;
        candidate := left(base, 36) || '-' || n;
    end loop;
    new.slug := candidate;
    return new;
end;
$$;

-- 3. vtuber_contributions：查重與雜湊 IP
alter table public.vtuber_contributions
    add column if not exists youtube_channel_id text,
    add column if not exists ip_hash text;

alter table public.vtuber_contributions
    add constraint vtuber_contributions_youtube_channel_id_format
        check (youtube_channel_id is null or youtube_channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
    add constraint vtuber_contributions_ip_hash_len check (ip_hash is null or char_length(ip_hash) <= 64);

create unique index if not exists vtuber_contributions_pending_channel_uq
    on public.vtuber_contributions (youtube_channel_id)
    where status = 'pending' and youtube_channel_id is not null;

create index if not exists vtuber_contributions_status_created_idx
    on public.vtuber_contributions (status, created_at desc);

-- 4. admin_actions
alter table public.admin_actions alter column admin_user_id drop not null;
alter table public.admin_actions add column if not exists actor text;
alter table public.admin_actions add constraint admin_actions_actor_len check (actor is null or char_length(actor) <= 64);
alter table public.admin_actions drop constraint if exists admin_actions_action_type_check;
alter table public.admin_actions add constraint admin_actions_action_type_check check (
    action_type = any (array['review_vtuber_contribution', 'review_vtuber_event', 'review_vtuber_report', 'ban_user', 'other'])
);

-- 5. 核准投稿（單一交易）
-- p_overrides：後台審核時修改過的欄位，覆蓋投稿 payload。可用的 key：
--   name, nationality, avatar_url, bio, x_url, facebook_url, instagram_url, twitch_login,
--   group_id（既有團體）或 new_group {name, kind, nationality}，以及 reviewer_notes。
-- 回傳 {vtuber_id, slug}。錯誤以 exception 回報（not_found／not_pending／unsupported_action／exists／group_not_found／invalid_name）。
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

    -- 所屬：既有團體、新建團體，或個人勢（null）
    if nullif(p ->> 'group_id', '') is not null then
        select id into v_group from public.vtuber_groups where id = (p ->> 'group_id')::uuid;
        if v_group is null then
            raise exception 'group_not_found' using errcode = 'P0002';
        end if;
    elsif nullif(btrim(p -> 'new_group' ->> 'name'), '') is not null then
        insert into public.vtuber_groups (name, kind, nationality)
        values (
            btrim(p -> 'new_group' ->> 'name'),
            coalesce(nullif(p -> 'new_group' ->> 'kind', ''), 'unverified'),
            nullif(p -> 'new_group' ->> 'nationality', '')
        )
        on conflict (name) do update set name = excluded.name
        returning id into v_group;
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

    v_twitch := nullif(lower(btrim(p ->> 'twitch_login')), '');

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
    -- Twitch 的數字 ID 稍後由 backfill（scripts/local/backfill-twitch-ids.mjs）補上；先記 login
    if v_twitch is not null then
        insert into public.vtuber_channels (vtuber_id, platform, external_id, handle, display_name, verified, status)
        values (v_vt, 'twitch', null, v_twitch, v_name, false, 'active');
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
