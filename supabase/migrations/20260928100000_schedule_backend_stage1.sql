-- 開台週表後端 階段 0～1：資料模型
-- 規劃文件：Claude Docs「MultiStream Hub 開台周表規劃 v1」的「資料模型草案」。
--
-- 新增：
--   1. streams                 — 所有平台、所有來源的直播場次（取代空表 vtuber_livestreams；舊表暫不刪，
--                                functions/api/cron/sync-livestreams.js 仍引用它，待該 Function 下線後另開 migration 清理）
--   2. schedule_channel_state  — 每個頻道的分級（T1/T2/T3）與 RSS 健康度（排程用內部狀態）
--   3. service_tokens          — 服務端 token 快取（Twitch app token；Edge Function 沒有 KV 可用）
--   4. cron_shard_state 補兩列 — Heavy / Light 的 RSS 分片游標
--   5. Storage bucket streams  — 公開 snapshot（streams/v1/snapshot.json）
--
-- 權限原則：寫入一律只給 service_role（不開 INSERT/UPDATE/DELETE policy）；
-- streams 給 anon/authenticated 讀「會進週表」的列（排除 hidden 與常駐框），其餘三張表完全不開放。
--
-- 回滾：
--   delete from storage.objects where bucket_id = 'streams'; delete from storage.buckets where id = 'streams';
--   delete from public.cron_shard_state where job_name in ('schedule_heavy_rss', 'schedule_light_rss');
--   drop table if exists public.service_tokens, public.schedule_seen_videos, public.schedule_channel_state, public.streams;

-- ===== 1. streams =====
create table public.streams (
    id                uuid primary key default gen_random_uuid(),
    vtuber_id         uuid not null references public.vtubers(id) on delete cascade,
    channel_id        uuid not null references public.vtuber_channels(id) on delete cascade,
    platform          text not null check (platform in ('youtube', 'twitch')),
    -- YouTube: videoId；Twitch: 直播中為 helix stream id、週表（階段 2）為 segment id
    external_id       text not null check (char_length(external_id) between 1 and 128),
    source            text not null check (source in ('yt_waiting_room', 'twitch_schedule', 'twitch_live', 'manual')),
    status            text not null check (status in ('scheduled', 'live', 'ended', 'expired', 'canceled', 'hidden')),
    scheduled_start   timestamptz,
    scheduled_end     timestamptz,
    actual_start      timestamptz,
    actual_end        timestamptz,
    title             text check (title is null or char_length(title) <= 300),
    category          text check (category is null or char_length(category) <= 100),
    thumbnail_url     text check (thumbnail_url is null or char_length(thumbnail_url) <= 2048),
    viewer_count      integer check (viewer_count is null or viewer_count >= 0),
    -- 常駐框：排定時間離現在超過門檻天數（規則見 _shared/rules.ts），不進週表但保留
    is_schedule_frame boolean not null default false,
    -- 雙平台合併（階段 2）指向對方場次
    merged_with       uuid references public.streams(id) on delete set null,
    fetched_at        timestamptz not null default now(),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (platform, external_id)
);

comment on table public.streams is
  '開台週表的直播場次（YouTube 待機室／Twitch 直播中／未來的 Twitch 週表與手動登錄）。只由排程 Edge Function 以 service_role 寫入。';
comment on column public.streams.is_schedule_frame is
  '常駐框：頻道用來放週表圖的「幾百年後」排程直播。排定時間超過門檻天數即標記，不進週表，保留可回溯。';

create index streams_vtuber_idx on public.streams (vtuber_id);
create index streams_channel_idx on public.streams (channel_id);
-- 週表查詢：live / scheduled 依排定時間；recent 依實際結束時間
create index streams_active_idx on public.streams (status, scheduled_start)
    where status in ('scheduled', 'live') and not is_schedule_frame;
create index streams_recent_idx on public.streams (actual_end desc)
    where status = 'ended';
-- Light 排程只重查 scheduled / live 的 YouTube 影片
create index streams_pending_idx on public.streams (platform, status)
    where status in ('scheduled', 'live');

create trigger streams_touch_updated_at
    before update on public.streams
    for each row execute function public.touch_updated_at();

alter table public.streams enable row level security;

-- 公開讀：只給會進週表的列；hidden（tombstone）與常駐框不露出
create policy streams_public_select
    on public.streams
    for select
    to anon, authenticated
    using (status <> 'hidden' and not is_schedule_frame);

revoke insert, update, delete, truncate on public.streams from anon, authenticated;

-- ===== 2. schedule_channel_state =====
create table public.schedule_channel_state (
    channel_id          uuid primary key references public.vtuber_channels(id) on delete cascade,
    tier                smallint not null check (tier in (1, 2, 3)),
    tier_reason         text check (tier_reason is null or char_length(tier_reason) <= 100),
    tier_updated_at     timestamptz not null default now(),
    -- RSS 健康度：連續失敗次數達門檻就改走 playlistItems.list 備援（規則見 _shared/rules.ts）
    rss_fail_streak     integer not null default 0 check (rss_fail_streak >= 0),
    rss_last_ok_at      timestamptz,
    rss_last_error      text check (rss_last_error is null or char_length(rss_last_error) <= 200),
    last_checked_at     timestamptz,
    last_new_video_at   timestamptz,
    updated_at          timestamptz not null default now()
);

comment on table public.schedule_channel_state is
  '排程用的頻道內部狀態：活躍度分級（T1/T2/T3）與 RSS 健康度。僅 service_role 可存取。';

create index schedule_channel_state_tier_idx on public.schedule_channel_state (tier, channel_id);

create trigger schedule_channel_state_touch_updated_at
    before update on public.schedule_channel_state
    for each row execute function public.touch_updated_at();

alter table public.schedule_channel_state enable row level security;
revoke all on public.schedule_channel_state from anon, authenticated;

-- ===== 2b. schedule_seen_videos：RSS 看過的影片 =====
-- RSS 每次都回頻道最新 15 支影片，其中多數是一般上傳。沒有這張表，每一輪都會把同一批影片
-- 再送 videos.list 一次（2,500 頻道 × 15 支 ≈ 750 單位／輪）。看過一次就記下來，之後只查真正新的。
create table public.schedule_seen_videos (
    video_id      text primary key check (video_id ~ '^[a-zA-Z0-9_-]{11}$'),
    channel_id    uuid not null references public.vtuber_channels(id) on delete cascade,
    -- stream：有 liveStreamingDetails（已寫進 streams）；video：一般上傳；missing：API 查不到
    kind          text not null check (kind in ('stream', 'video', 'missing')),
    published_at  timestamptz,
    first_seen_at timestamptz not null default now()
);

comment on table public.schedule_seen_videos is
  '排程已用 videos.list 分類過的 YouTube 影片，避免重複耗配額。僅 service_role 可存取。';

create index schedule_seen_videos_channel_idx on public.schedule_seen_videos (channel_id, first_seen_at desc);

alter table public.schedule_seen_videos enable row level security;
revoke all on public.schedule_seen_videos from anon, authenticated;

-- ===== 3. service_tokens =====
create table public.service_tokens (
    name        text primary key check (name ~ '^[a-z0-9_]{1,50}$'),
    token       text not null,
    expires_at  timestamptz not null,
    updated_at  timestamptz not null default now()
);

comment on table public.service_tokens is
  '服務端 OAuth token 快取（例：twitch_app）。僅 service_role 可存取；前端永遠不能碰。';

alter table public.service_tokens enable row level security;
revoke all on public.service_tokens from anon, authenticated;

-- ===== 4. cron_shard_state：Heavy / Light 的 RSS 游標 =====
insert into public.cron_shard_state (job_name, shard_size) values
    ('schedule_heavy_rss', 400),
    ('schedule_light_rss', 500)
on conflict (job_name) do nothing;

-- ===== 5. Storage：公開 snapshot bucket =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('streams', 'streams', true, 10485760, array['application/json'])
on conflict (id) do nothing;
