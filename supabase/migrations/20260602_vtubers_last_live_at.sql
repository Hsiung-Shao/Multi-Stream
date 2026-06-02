-- #34 卡片資訊區塊 — vtubers 加「上次直播時間」欄位
--
-- 由 sync-livestreams cron 每輪對「目前正在直播」的 vtuber 更新為 now()。
-- 直播結束後值凍結，卡片即可顯示「上次直播 X 前」。
-- NULL = 自此功能上線後從未偵測到直播。

ALTER TABLE public.vtubers
    ADD COLUMN IF NOT EXISTS last_live_at timestamptz;

COMMENT ON COLUMN public.vtubers.last_live_at IS
    '最後一次偵測到正在直播的時刻；sync-livestreams cron 對 live 中的 vtuber 更新。NULL = 從未偵測到。';
