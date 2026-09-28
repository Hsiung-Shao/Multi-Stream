# archive

`20260706_snapshot_twitch_followers_shard_cron.sql`：從未在正式站執行（cron.job 沒有此排程），且內容會用 pg_net 每 20 分鐘打正式網域 `https://multistreaming.org/api/cron/...`。本地 `supabase db reset` 絕不能套用，故移出 `migrations/` 留檔備查。
