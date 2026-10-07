# schedule-posts：社群週表圖解析（本機＋Claude Desktop 排程讀圖）

台 V 多數把週表做成圖片貼在 YouTube 社群、不開待機室，週表「即將開台」因此抓不到。
這套在**這台主機**上跑，分兩段，讀圖由 **Claude Desktop 排程任務本身**完成（不接 Anthropic API、沒有 API 費用）：

```
collect  抓頻道貼文頁（零 API 配額）→ 有圖且文字含週表關鍵字的新貼文 → 下載圖到 work/images/
         → 寫 work/candidates.json 與 work/INSTRUCTIONS.md
（排程中的 Claude 讀 INSTRUCTIONS.md、用 Read 看每張圖、寫 work/results.json）
apply    規則檢查 → 高信心直接寫 streams（source=community_post），低信心寫 vtuber_contributions（action=schedule）待審
         → 每篇記 schedule_community_posts（去重、稽核）
```

Light 排程每 10 分鐘會把這些場次與待機室合併（待機室出現就併掉）並發布 snapshot；腳本本身不碰 snapshot。
決策與資料用法：Obsidian `multi-stream/10 決策紀錄/.../2026-10-05-multi-stream-社群週表圖片解析與投稿`。

## 設定

1. 複製 `.env.example` 為 `.env`（已 gitignore），填入正式站 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（Supabase 後台 Project Settings → API）。
2. 正式站要先套 migration `20261005100000_schedule_community_posts.sql`，Edge Function schedule-light／heavy／live 要重新部署（排除沒有影片 ID 的來源）。

## 手動用法

```bash
# 抓候選（不寫庫；只寫 work/）
node scripts/schedule-posts/run.mjs collect --limit 50

# 排程中的 Claude（或你自己）看圖後寫 work/results.json，然後：
node scripts/schedule-posts/run.mjs apply --dry-run   # 只印決策
node scripts/schedule-posts/run.mjs apply             # 真寫

# 本地 Supabase（連線由 supabase status 取得）
node scripts/schedule-posts/run.mjs collect --env local --channel UCswRX8mNNdn1fjRctZqzjgA
```

參數：`collect|apply`、`--env prod|local`、`--limit N`、`--channel UC…`、`--reset`（游標歸零）、`--dry-run`（apply）。

注意：repo 根目錄的 `.dev.vars` 的 `SUPABASE_URL` 指向**正式站**，所以 `--env local` 不讀它，而是用 `supabase status` 的本地 API_URL，
並以網址防呆（local 只接受 127.0.0.1／localhost；prod 拒絕本地網址）。

## 排程（Claude Desktop 排程任務）

任務 `schedule-posts-vision`（2026-10-05 建立，`~/.claude/scheduled-tasks/schedule-posts-vision/SKILL.md` 可改）：每天 10:00、22:00，
在 repo 目錄跑 `collect` → 讀 `work/INSTRUCTIONS.md`、逐張看 `work/images/*.jpg`、寫 `work/results.json` → 跑 `apply` → 回報統計。
排程只在 Claude Desktop 開著時執行；關著的期間錯過的會在下次開啟時補跑一次。排程工具沒有「指定模型」欄位，
用的是 App 新 session 的預設模型（使用者裁定 Haiku 4.5，請在 App 設定預設模型）。

## 保護與成本

- 每日最多 300 張（`VISION_DAILY_CAP`，算 `schedule_community_posts` 當日列數）；每頻道每輪最多 2 張。
- 同一篇貼文只處理一次（`schedule_community_posts.post_id`），30 天內不重看；上一輪沒結果的候選會留在 `candidates.json` 併入下一輪。
- 連續 10 個頻道抓不到貼文頁 → 判定限流停止，游標停在連續成功的最後一處，下次續跑。
- 寫入前的規則：日期落在發文日 −1～+10 天、時間合法、剔除休息日與已過 3 小時的列；整體信心 ≥ 0.75 且每列 ≥ 0.6 且剔除列不多於通過列才自動上線，否則待審。
- 新週表取代舊週表：同一人同來源、日期重疊、還沒開台的舊列改 `canceled`。
- 同一人已有待審的週表投稿時，這篇不記（下一輪再抓）。

## 觀察

```sql
select status, count(*) from schedule_community_posts where created_at >= now() - interval '1 day' group by status;
select count(*) from streams where source = 'community_post' and status = 'scheduled';
select count(*) from vtuber_contributions where action = 'schedule' and status = 'pending';
```
