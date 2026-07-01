-- 連結 vtubers ↔ youtube_channels(回填 + 外鍵)
--
-- 目的:把 vtubers 主表的 youtube_channel_id 與 youtube_channels.channel_id
--       建立正式 FK 關聯,形成可查詢的統一頻道資料。
-- 執行:於遠端 Supabase 以 service_role 執行(本專案無本地 migration 目錄)。
-- 冪等:1a 用 ON CONFLICT DO NOTHING;1b 加 FK 前以 1c 驗證 missing=0。
--
-- 對應計畫:連結 vtubers↔youtube_channels + 擴充 IslandSearch 搜尋 YouTube 頻道

-- 1a. 回填:把 vtubers 裡尚未在 youtube_channels 的 channel 補進去
--     channel_title 用 vtubers.name(可能非官方名);fetched_at 設 1970 標記為 stale,
--     讓 App 既有流程在使用者實際播放/查詢時自動刷新成完整 metadata。
insert into youtube_channels (channel_id, channel_title, thumbnail_url, subscriber_count, fetched_at)
select youtube_channel_id, name, img_url, youtube_subscriber_count, '1970-01-01T00:00:00Z'::timestamptz
from vtubers
where youtube_channel_id is not null
on conflict (channel_id) do nothing;

-- 1c. 驗證:加 FK 前必須為 0
select count(*) as missing
from vtubers v
where v.youtube_channel_id is not null
  and not exists (select 1 from youtube_channels c where c.channel_id = v.youtube_channel_id);

-- 1b. 加外鍵(missing=0 後才執行)
--     on delete set null:快取列被清理時不連帶刪 vtuber 主資料(對齊既有 group_id FK)
alter table public.vtubers
  add constraint vtubers_youtube_channel_id_fkey
  foreign key (youtube_channel_id) references youtube_channels(channel_id)
  on update cascade on delete set null;

-- ── 回退 ──────────────────────────────────────────────
-- alter table public.vtubers drop constraint vtubers_youtube_channel_id_fkey;
-- delete from youtube_channels where fetched_at = '1970-01-01T00:00:00Z';  -- 僅刪回填列(以 1970 標記)
