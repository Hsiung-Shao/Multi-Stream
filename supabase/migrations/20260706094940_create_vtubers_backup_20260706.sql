-- vtubers 資料備份快照(重構多平台帳號欄位前的安全網)
--
-- 這次要把 vtubers.youtube_channel_id/youtube_subscriber_count/twitch_channel_id/
-- twitch_follower_count/channel_id_verified 正規化搬到新的 vtuber_channels 表。
-- 舊欄位本身不會被刪除(仍保留在 vtubers 上),但先做一次明確快照當額外安全網。
--
-- 純內部回復用,不開 RLS。待 Stage 1 上線穩定運作一段時間後可手動清除。

CREATE TABLE public.vtubers_backup_20260706 AS
SELECT id, youtube_channel_id, youtube_subscriber_count,
       twitch_channel_id, twitch_follower_count, channel_id_verified, updated_at
FROM public.vtubers;
