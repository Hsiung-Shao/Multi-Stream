-- 【本地專用】正式站 vtubers.youtube_channel_id 手動加的外鍵 vtubers_youtube_channel_id_fkey → youtube_channels(channel_id)
--
-- 原本在 20260928000000 加（d5d5c1e），但全新的本地 DB（supabase db reset）沒有 youtube_channels 資料
-- （正式站的頻道快取是腳本匯入的，不在 migration 裡），名冊等資料 migration（20260929120100 起）在空 DB 上一定撞 23503，
-- reset 跑不完。改成在所有 migration 之後以 NOT VALID 加上：
--   - 既有列不驗（空 DB 上資料 migration 寫的 vtubers 本來就對不到頻道快取）；
--   - 之後新寫入／更新的列照樣檢查，與正式站一樣能抓到「vtubers 指到沒有快取列的頻道」這類錯誤。
-- 本地資料用腳本補齊頻道快取後，可手動 alter table public.vtubers validate constraint vtubers_youtube_channel_id_fkey;
-- 已有這條外鍵的本地 DB（套過舊版 20260928000000）會跳過。

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'vtubers_youtube_channel_id_fkey' and conrelid = 'public.vtubers'::regclass) then
        alter table public.vtubers
            add constraint vtubers_youtube_channel_id_fkey foreign key (youtube_channel_id)
            references public.youtube_channels(channel_id) on update cascade on delete set null
            not valid;
    end if;
end $$;
