# VTuber 訂閱數/頻道資料更新改用 Discord Bot(Python)排程執行

> 本文件是要交接給另一個 agent/session 實作的獨立交接文件，內容力求自我完備
> (self-contained)，不假設接手者看過先前對話。

## Context：為什麼從 Cloudflare Pages Functions 改成 Discord Bot

專案原本規劃「每日排程更新 VTuber 訂閱數」用 Supabase `pg_cron` + `pg_net` 觸發
Cloudflare Pages Function 執行。過程中發現 Cloudflare Workers/Pages Functions
每次呼叫有 subrequest(對外 fetch)數量上限(**使用者確認自己是 Cloudflare
免費方案**，上限更緊，一般認知是每次呼叫 50 次)。正式環境規模：**1362 個
啟用中(`vtubers.activity='active'`)且綁 Twitch 的頻道、2470 個綁 YouTube 的
頻道**。Twitch `/channels/followers`(查詢 follower 數)沒有批次端點、每個
頻道要各打一次 API，光是這樣就已經遠超 50 次的免費方案上限，就算搭配
YouTube 批次查詢(50 個 id/次，2470 個頻道只要約 50 次呼叫)也還是不夠，
逼得先前的方案必須做「分片」(每次只處理一小批、用游標記錄進度、拉長排程
頻率慢慢輪完)來勉強塞進上限——這是一套為了繞過 serverless 平台限制而生的
繞路設計。

使用者後來提出：**這個排程更新工作不一定要用 Cloudflare/Supabase 執行**，
剛好有一個 24/7 常駐(使用者本機電腦幾乎不關機)、用 Python 寫的 Discord
bot，可以直接讓這個 bot 做排程觸發 + 執行整個更新流程。**這個方向可行且更
簡單**：一般 Python 常駐程式沒有 serverless 平台那種「每次呼叫最多打幾十次
API」的限制，可以單純寫一個迴圈依序(或小幅並行)打完全部 1362+2470 個頻道，
**完全不需要分片/游標機制**，大幅簡化邏輯。

**這次要做的事**：把訂閱數/頻道資料更新的邏輯，從 Cloudflare Pages Function
(JS)搬到 Discord bot(Python)裡，用 `discord.py` 內建的 `tasks.loop` 排程
觸發。**範圍只有「訂閱數/頻道資料更新」這一項**，不含直播即時偵測
(`sync-livestreams` 那條線，仍是獨立、暫緩中的 Cloudflare 功能，不在這次
範圍內)。

## 已經完成、可以直接沿用的部分(資料庫層，與程式語言無關)

以下這些已經在正式環境的 Supabase Postgres 上建好並驗證過，**Python 端直接
沿用同一套 schema，不需要重新設計**：

### 資料表 1：`vtuber_channels`(VTuber 多平台帳號)

```
id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
vtuber_id        uuid NOT NULL REFERENCES vtubers(id) ON DELETE CASCADE
platform         text NOT NULL CHECK (platform IN ('youtube', 'twitch'))
external_id      text        -- YouTube: channel_id(=handle)；Twitch: broadcaster_id(resolve 後才有值，初始為 NULL)
handle           text NOT NULL  -- YouTube: channel_id；Twitch: login(使用者可改名，易變)
display_name     text
verified         boolean NOT NULL DEFAULT false
status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed'))
subscriber_count integer     -- 最新已知值快取
stats_updated_at timestamptz
created_at       timestamptz NOT NULL DEFAULT now()
updated_at       timestamptz NOT NULL DEFAULT now()
```

唯一索引：`(platform, external_id) WHERE external_id IS NOT NULL AND status='active'`、
`(platform, lower(handle)) WHERE external_id IS NULL AND status='active'`。

RLS 已開啟且**沒有任何 SELECT/INSERT/UPDATE policy**——只有用 `service_role`
key 才能讀寫(繞過 RLS)，Python 端務必用 `SUPABASE_SERVICE_ROLE_KEY`，不能用
anon key。

⚠️ **重要 PostgREST/Postgres 陷阱(已實測踩過一次，務必注意)**：`vtuber_id`、
`platform`、`handle` 是 **NOT NULL 且沒有 DEFAULT** 的欄位。即使用
`upsert`(`on_conflict=id` + `Prefer: resolution=merge-duplicates`)去更新一筆
**已經存在**的 row、只想改 `subscriber_count` 一個欄位，Postgres 仍然會用
「這次 INSERT 帶的欄位 + 其他欄位的 DEFAULT/NULL」組出一個完整候選列，**在
判斷要不要真的 INSERT 之前就先驗證 NOT NULL 約束**——只要 payload 沒帶到
`vtuber_id`/`platform`/`handle`，就會噴 `23502 not-null violation`，即使
最終根本走的是 UPDATE 分支。**每次 upsert 這張表都要把這三欄一起帶上**(值
不變也要帶，等同無害重寫)。

### 資料表 2：`vtuber_channel_metrics_daily`(每日訂閱數快照)

```
id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
channel_id       uuid NOT NULL REFERENCES vtuber_channels(id) ON DELETE CASCADE
metric_date      date NOT NULL   -- 呼叫端自己算好的 UTC 日期(YYYY-MM-DD)，不要用資料庫運算式
subscriber_count integer NOT NULL CHECK (subscriber_count >= 0)
view_count       bigint       -- YouTube 專用，Twitch 填 NULL
video_count      integer      -- YouTube 專用，Twitch 填 NULL
recorded_at      timestamptz NOT NULL DEFAULT now()
UNIQUE (channel_id, metric_date)
```

這張表的唯一鍵是**真實欄位**(不是運算式索引)，所以 `on_conflict=channel_id,metric_date`
可以直接搭配 upsert 用，一次呼叫就能達成「今天已經記錄過就更新、沒記錄過就
新增」，不需要額外查詢。這張表沒有 `vtuber_id`/`platform`/`handle` 這種
NOT NULL 陷阱欄位，其餘欄位都有 DEFAULT 或允許 NULL，upsert 時只帶
`channel_id, metric_date, subscriber_count, view_count, video_count` 即可。

### 舊資料表 `vtubers` 上的欄位——保留但這次不寫

`vtubers.youtube_channel_id` / `youtube_subscriber_count` / `twitch_channel_id`
/ `twitch_follower_count` / `channel_id_verified` 這幾個舊欄位目前**還保留在
表上、沒有刪除**(因為專案另一個分支 `dev` 的前端還在讀這些欄位，遷移是
未來另一個階段的事)。**這次的 Python bot 不需要寫這些欄位**，只寫新的
`vtuber_channels`/`vtuber_channel_metrics_daily` 就好。已有 `vtubers_backup_20260706`
備份表保留了這些舊欄位的快照，不用管它。

### 現有 Python 端要如何得知「哪些頻道要更新」

用 Supabase REST(PostgREST embedded resource + `!inner` join filter)一次查出
「所屬 VTuber 仍是啟用中」的頻道，兩個平台分開查：

```
GET /rest/v1/vtuber_channels
    ?select=id,vtuber_id,handle,external_id,vtubers!inner(activity)
    &platform=eq.youtube          (或 eq.twitch)
    &status=eq.active
    &vtubers.activity=eq.active
```

這個查詢語法已經在 JS 版實測過會正確運作(`supabase-py` 底層也是打
PostgREST REST API，語法應該完全一樣，用 `.select()`/`.eq()` 之類的
query builder 或直接組 URL 皆可)。

## 這次要實作的兩個排程任務(合併成一支 Python 排程即可，不必分開)

因為沒有 serverless 平台的呼叫次數限制，**不需要像先前 JS 版那樣把 Twitch
拆成獨立分片排程**，可以合併成一支每日執行一次的任務，內部依序處理兩個
平台：

### 1. YouTube 訂閱數/觀看數/影片數快照

- 查詢：如上，`platform=eq.youtube`
- 呼叫 YouTube Data API v3：`GET https://www.googleapis.com/youtube/v3/channels?part=statistics&id=<逗號分隔最多50個id>&key=<YOUTUBE_API_KEY>`
  - 一次最多 50 個 id，2470 個頻道約需 50 次呼叫
  - `statistics` 回傳的 `subscriberCount`/`viewCount`/`videoCount` 都是字串，
    需要轉 int；`hiddenSubscriberCount=true` 或該 id 未在回應中出現時，
    **沿用資料庫舊值、不要覆蓋成 null**(對齊 JS 版既有邏輯，見下方參考檔案)
  - `YOUTUBE_API_KEY` 若是有 HTTP referer 限制的前端 key，server-to-server
    呼叫要帶 `Referer` header(對應環境變數 `YOUTUBE_API_REFERER`，目前
    Cloudflare 端用的值是 `https://multistreaming.org`)；也可以考慮改用
    沒有 referer 限制的 server 專用 key，看使用者手上有哪種
- 寫入：批次 upsert `vtuber_channels`(`on_conflict=id`，記得帶
  `vtuber_id,platform='youtube',handle`)+ 批次 upsert
  `vtuber_channel_metrics_daily`(`on_conflict=channel_id,metric_date`)

### 2. Twitch follower 數快照

- 查詢：如上，`platform=eq.twitch`
- **broadcaster_id 解析(只需要做一次，之後都從快取讀)**：對
  `external_id IS NULL` 的頻道，呼叫 `GET https://api.twitch.tv/helix/users?login=<login1>&login=<login2>...`
  (一次最多 100 個 login)，拿到 `id` 後 upsert 回
  `vtuber_channels.external_id`(同樣記得帶 `vtuber_id,platform='twitch',handle`)
- **查 follower 數(無批次端點，逐頻道)**：對每個有 `external_id` 的頻道呼叫
  `GET https://api.twitch.tv/helix/channels/followers?broadcaster_id=<id>&first=1`，
  回應的 `total` 欄位就是 follower 數
  - Twitch app access token：`POST https://id.twitch.tv/oauth2/token`
    (`grant_type=client_credentials`)，token 效期約 60 天，建議快取起來
    (例如存本機檔案/記憶體 + 到期時間戳)，不用每次執行都重拿
  - 1362 個頻道逐一呼叫，建議呼叫間加小延遲(例如 50-100ms)避免撞 Twitch
    Helix 的 rate limit(app token 預設約 800 points/分鐘，一般每次呼叫消耗
    1 point)；1362 次 × 0.1 秒 ≈ 2.3 分鐘，對背景任務完全可接受
- 寫入：同上，批次 upsert 兩張表

### (可選，非必要)YouTube 頻道快取表 `youtube_channels` 全表刷新

除了 VTuber 專屬的 `vtuber_channels`，專案還有一張獨立的 `youtube_channels`
表(服務「使用者自行搜尋/收藏任意 YouTube 頻道」的快取，不限 VTuber)。原本
的 JS cron 也會每天全表刷新這張表(邏輯對齊 `scripts/enrich-youtube-channels.mjs`)。
**這次是否也要讓 Python bot 一併接手，還是維持現狀(這張表目前的即時寫入
路徑是使用者新增收藏/觀看時觸發，跟排程更新無關，可以先不管)，由接手的
agent 跟使用者確認**。若要做，邏輯與 YouTube 訂閱數快照類似，只是查詢全部
`youtube_channels` 而非只查 VTuber 綁定的頻道，見下方參考檔案。

## 參考實作(JS 版，已寫好且用真實資料端對端驗證過，邏輯可以逐段對照翻譯成 Python)

以下檔案在 git 分支 `feat/vtuber-channels-v2`(從 `next` 分支拉出)裡，**這是
未來如果要接手/比對邏輯時最直接的參考**(邏輯正確性已驗證，只是語言換成
Python、拿掉分片機制)：

- `functions/api/cron/snapshot-subscribers.js` — YouTube 訂閱數/頻道快取邏輯
- `functions/api/cron/snapshot-twitch-followers.js` — Twitch follower 數 +
  broadcaster_id 解析快取邏輯(裡面的分片/游標邏輯這次不需要照搬，只要
  「broadcaster_id 快取」的概念)
- `functions/lib/supabase-server.js` 的 `upsert()` — 可以看到 PostgREST
  upsert 呼叫的確切 header/query 組法(`on_conflict=...` + `Prefer:
  resolution=merge-duplicates,return=minimal`)
- `functions/lib/twitch-token.js` — Twitch app token 取得 + 快取邏輯參考

這幾支 JS 檔案**不需要刪除**，先保留在該分支當備用/參考。

## 環境變數/憑證(Python 端需要準備)

| 變數 | 用途 | 現有值在哪裡 |
|---|---|---|
| `SUPABASE_URL` | Supabase 專案 URL | `.dev.vars`(專案根目錄，已 gitignore) |
| `SUPABASE_SERVICE_ROLE_KEY` | 繞過 RLS 讀寫 | 同上 |
| `YOUTUBE_API_KEY` | YouTube Data API v3 | 同上 |
| `YOUTUBE_API_REFERER` | 若 key 有 referer 限制需帶(可選) | 同上，值為 `https://multistreaming.org` |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | Twitch Helix API app token | 同上 |

Python 端建議用 `python-dotenv` 讀取獨立的 `.env`(bot 專案自己的環境變數
檔案，不要直接讀 multi-stream 專案的 `.dev.vars`，兩邊是不同的
codebase/repo)，把上述值複製過去。

## 排程設計(discord.py)

```python
from discord.ext import tasks

@tasks.loop(hours=24)
async def snapshot_vtuber_channels():
    await snapshot_youtube_channels()   # 見上方「YouTube 訂閱數快照」
    await snapshot_twitch_channels()    # 見上方「Twitch follower 數快照」
```

在 bot 的 `setup_hook`/`on_ready` 裡啟動這個 loop。建議加基本的例外處理，
確保單次執行失敗不會讓整個 `tasks.loop` 停止排程(discord.py 的
`tasks.loop` 預設遇到未捕捉例外會直接停止迴圈，需要自己在函式內
try/except 包起來，或用 `@snapshot_vtuber_channels.error` 註冊錯誤處理)。

## Supabase 端既有排程的收尾

正式環境的 `cron.job` 裡目前還有 `snapshot_vtuber_subscribers`(每日
00:05 UTC)這個 pg_cron 排程，指向 Cloudflare Function 的
`/api/cron/snapshot-subscribers`——**這個 Cloudflare 端點目前沒有部署到
production(`main` 分支沒有 `functions/api/cron/` 目錄)，這個排程本來就一直
在打 404/403，沒有實際運作**。既然改用 Discord bot 執行這項工作，建議在
確認 Python 版排程運作正常後，執行：

```sql
SELECT cron.unschedule('snapshot_vtuber_subscribers');
```

避免這個排程繼續每天空跑一次無效請求(不影響資料正確性，純粹清理)。
`sync_vtuber_livestreams`(直播即時偵測，每 2 分鐘)是**完全不同的功能**，
不在這次調整範圍內，維持原狀即可。

## 驗證方式

1. 先用少量資料(例如 `limit=3` 只查 3 個頻道)手動跑一次腳本，確認：
   - 讀取查詢正確回傳資料
   - YouTube/Twitch API 呼叫正確
   - upsert 到 `vtuber_channels`/`vtuber_channel_metrics_daily` 沒有報錯
     (特別注意上面提到的 NOT NULL 陷阱)
   - 查回 Supabase 確認資料真的寫進去、數值正確
2. 確認完整規模(2470 個 YouTube + 1362 個 Twitch)跑一次不會逾時/被 API
   rate limit 擋下
3. 排程跑幾天後，查 `vtuber_channel_metrics_daily` 確認每天都有新的
   `metric_date` 累積，沒有斷過

## 不在這次範圍內的事項(供接手者知悉，避免誤觸)

- 直播即時偵測(`sync-livestreams`)、開台週報表、推薦排行榜 SQL 聚合、
  `dev` 分支前端遷移——這些是先前規劃中提到的後續階段，這次只處理
  訂閱數/頻道資料更新
- `vtubers` 舊欄位、`vtuber_subscriber_history`、`vtuber_livestreams` 舊表
  不要刪除(仍有其他分支的前端在用)
- `youtube_channels` 表的即時寫入路徑(使用者新增收藏/觀看/背景掃描收藏庫
  時觸發，透過 `functions/api/youtube/cache-channel.js`)跟這次排程無關，
  不要動
