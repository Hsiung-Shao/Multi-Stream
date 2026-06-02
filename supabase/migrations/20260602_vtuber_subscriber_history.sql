-- #34 訂閱數變化追蹤 — 每日快照表
--
-- 寫入：snapshot-subscribers cron（service_role）
--   - Twitch：每日一筆（helix /channels/followers 之 total，精確）→ 日級變化
--   - YouTube：每週一筆（channels.list statistics，API 四捨五入到 3 位有效）→ 週級變化
-- 讀取：前端透過 endpoint（service_role）算 delta / 畫變化圖
--
-- RLS：對齊 vtuber_livestreams「Anyone can read」；寫入僅 service_role（cron 繞 RLS）。

CREATE TABLE IF NOT EXISTS public.vtuber_subscriber_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vtuber_id uuid NOT NULL REFERENCES public.vtubers(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('twitch', 'youtube')),
    subscriber_count integer NOT NULL CHECK (subscriber_count >= 0),
    recorded_at timestamptz NOT NULL DEFAULT now()
);

-- 查某 vtuber 某平台的時間序列（畫變化圖 / 算 delta）
CREATE INDEX IF NOT EXISTS vtuber_subscriber_history_lookup_idx
    ON public.vtuber_subscriber_history (vtuber_id, platform, recorded_at DESC);

-- 每 vtuber 每平台每天最多一筆（防 cron 同日重複跑）
-- 用 (AT TIME ZONE 'UTC')::date 確保 expression 為 IMMUTABLE，可建 index
CREATE UNIQUE INDEX IF NOT EXISTS vtuber_subscriber_history_daily_uq
    ON public.vtuber_subscriber_history (vtuber_id, platform, ((recorded_at AT TIME ZONE 'UTC')::date));

ALTER TABLE public.vtuber_subscriber_history ENABLE ROW LEVEL SECURITY;

-- 公開可讀（訂閱數為公開資訊）
DROP POLICY IF EXISTS vtuber_subscriber_history_public_select ON public.vtuber_subscriber_history;
CREATE POLICY vtuber_subscriber_history_public_select
    ON public.vtuber_subscriber_history
    FOR SELECT
    TO public
    USING (true);
-- 無 INSERT/UPDATE/DELETE policy → anon/authenticated 不可寫，僅 service_role（cron）繞 RLS 寫入
