-- VTuber 訂閱數資料模型重設計 Stage 1:新增 vtuber_channels / vtuber_channel_metrics_daily / cron_shard_state
--
-- 背景:vtubers 表的 youtube_channel_id/twitch_channel_id 是兩組平行欄位(非正規化),
-- channel_id_verified 兩平台共用一個布林值,無法乾淨擴充第三平台;
-- vtuber_subscriber_history 的唯一索引是運算式索引,導致 PostgREST 的 on_conflict
-- 無法直接對應。這次新增三張表解決這些問題,取代 next 分支先前(已在 feat/vtuber-channels-v2
-- 之前的 next commit)的暫時性設計。
--
-- 動手前已做的安全檢查:
-- - vtubers_backup_20260706 已備份原始欄位快照
-- - twitch_channel_id 無重複值(確認過,可安全套用 unique index)
-- - youtube_channels 表 schema/寫入路徑(cache-channel.js)完全不受影響,不在本次變動範圍
--
-- 舊欄位(vtubers.youtube_channel_id/youtube_subscriber_count/twitch_channel_id/
-- twitch_follower_count/channel_id_verified)本次保留不刪除,只是 cron 不再寫入。
--
-- 驗證:SELECT count(*) FROM vtuber_channels; (應等於 youtube_linked + twitch_linked)
--      SELECT * FROM vtuber_channels WHERE platform='youtube' AND external_id IS DISTINCT FROM handle; (應為空)
-- 回退:DROP TABLE public.vtuber_channels, public.vtuber_channel_metrics_daily, public.cron_shard_state;
--      (vtubers 舊欄位未動,回退不影響任何既有功能)

-- ===== 1. vtuber_channels:VTuber 多平台帳號 =====
CREATE TABLE public.vtuber_channels (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vtuber_id        uuid NOT NULL REFERENCES public.vtubers(id) ON DELETE CASCADE,
    platform         text NOT NULL CHECK (platform IN ('youtube', 'twitch')),
    external_id      text,       -- YouTube: channel_id(=handle);Twitch: broadcaster_id(resolve 後才有)
    handle           text NOT NULL,  -- YouTube: channel_id;Twitch: login(可能改名)
    display_name     text,
    verified         boolean NOT NULL DEFAULT false,
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
    subscriber_count integer,          -- 最新已知值快取,卡片顯示免 join
    stats_updated_at timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX vtuber_channels_platform_external_uq
    ON public.vtuber_channels (platform, external_id) WHERE external_id IS NOT NULL AND status = 'active';
CREATE UNIQUE INDEX vtuber_channels_platform_handle_uq
    ON public.vtuber_channels (platform, lower(handle)) WHERE external_id IS NULL AND status = 'active';
CREATE INDEX vtuber_channels_vtuber_idx ON public.vtuber_channels (vtuber_id) WHERE status = 'active';

ALTER TABLE public.vtuber_channels ENABLE ROW LEVEL SECURITY;
-- 不開 anon/authenticated SELECT policy,對齊 2026-07-02 安全強化方向;讀取一律走 Cloudflare Function(service_role)

COMMENT ON TABLE public.vtuber_channels IS
  'VTuber 的多平台帳號,取代 vtubers.youtube_channel_id/twitch_channel_id 等平行欄位。僅 service_role 可存取。';

-- ===== 2. vtuber_channel_metrics_daily:取代 vtuber_subscriber_history =====
CREATE TABLE public.vtuber_channel_metrics_daily (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id       uuid NOT NULL REFERENCES public.vtuber_channels(id) ON DELETE CASCADE,
    metric_date      date NOT NULL,       -- cron 在應用層算好 UTC 日期直接寫入,不靠運算式索引
    subscriber_count integer NOT NULL CHECK (subscriber_count >= 0),
    view_count       bigint,              -- YouTube 專用(Twitch 為 null),備用熱度訊號
    video_count      integer,             -- YouTube 專用
    recorded_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (channel_id, metric_date)
);

CREATE INDEX vtuber_channel_metrics_daily_lookup_idx
    ON public.vtuber_channel_metrics_daily (channel_id, metric_date DESC);

ALTER TABLE public.vtuber_channel_metrics_daily ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.vtuber_channel_metrics_daily IS
  '每日訂閱數/觀看數快照,取代 vtuber_subscriber_history 的運算式索引設計。僅 service_role 可存取。';

-- ===== 3. cron_shard_state:通用游標狀態表,取代 KV 單一 key =====
CREATE TABLE public.cron_shard_state (
    job_name          text PRIMARY KEY,
    cursor_position   integer NOT NULL DEFAULT 0,
    shard_size        integer NOT NULL,
    total_items       integer,
    last_run_at       timestamptz,
    last_run_stats    jsonb,
    updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_shard_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.cron_shard_state IS
  '通用 cron 分片游標狀態,取代 KV 存單一字串的做法。僅 service_role 可存取。';

INSERT INTO public.cron_shard_state (job_name, shard_size) VALUES
    ('twitch_follower_snapshot', 200);

-- ===== 4. 回填:從 vtubers 現有欄位搬進 vtuber_channels =====
INSERT INTO public.vtuber_channels (vtuber_id, platform, external_id, handle, verified, subscriber_count, status)
SELECT id, 'youtube', youtube_channel_id, youtube_channel_id, COALESCE(channel_id_verified, false), youtube_subscriber_count, 'active'
FROM public.vtubers
WHERE youtube_channel_id IS NOT NULL;

INSERT INTO public.vtuber_channels (vtuber_id, platform, external_id, handle, verified, subscriber_count, status)
SELECT id, 'twitch', NULL, twitch_channel_id, COALESCE(channel_id_verified, false), twitch_follower_count, 'active'
FROM public.vtubers
WHERE twitch_channel_id IS NOT NULL;
