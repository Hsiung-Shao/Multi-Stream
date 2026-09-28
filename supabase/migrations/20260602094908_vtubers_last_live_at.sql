ALTER TABLE public.vtubers
    ADD COLUMN IF NOT EXISTS last_live_at timestamptz;

COMMENT ON COLUMN public.vtubers.last_live_at IS
    '最後一次偵測到正在直播的時刻；sync-livestreams cron 對 live 中的 vtuber 更新。NULL = 從未偵測到。';
