# 直播班表小工具（嵌入）推廣清單

給使用者執行的清單。目的：讓 VTuber 與粉絲把開台週表嵌到自己的網站，換真實外鏈與流量（SEO 階段 3）。
功能本體：個人週表頁「嵌入到我的網站」、名錄頁「嵌入這個團的週表」、教學 `/instructions/embed-schedule`。

## 上線後第一週

- [ ] **Threads 示範貼文（繁中）**（附你自己做的截圖：Notion 或部落格裡的嵌入畫面）
  > 做了一個小東西：台灣 VTuber 的開台週表現在可以「嵌」到自己的網站、Notion、部落格，會自己更新。
  > 到 multistreaming.org/schedule/你的名字 → 按「嵌入到我的網站」→ 複製一段就好。
  > 放不了的地方（Linktree、IG）可以下載週表圖。教學：multistreaming.org/zh-TW/instructions/embed-schedule
- [ ] **X 示範貼文（英文）**
  > Taiwanese VTuber stream schedules can now be embedded on your own site, Notion or blog, and they update themselves.
  > Open multistreaming.org/schedule/<name> → “Embed on my site” → copy. No iframe? Download the schedule image instead.
  > How-to: multistreaming.org/instructions/embed-schedule
- [ ] **回覆 SEO 教練那串**：一句「照你的建議做了班表小工具，嵌入都帶回連結，教學在 …」附連結；不要要求對方轉發。
- [ ] **直接私訊 5～10 位有自己網站／Notion 頁的 VTuber**（名錄裡找有個人站的；名單自己列）：一句話＋教學連結，不群發。
- [ ] **投稿表單成功頁**（週表投稿、VTuber 投稿）加一句「也可以把週表嵌到你的網站 → 教學」。（待做：`src/features/contribute/*` 成功畫面文案）

## 持續

- [ ] 每次有 VTuber 真的嵌了（`embed_usage` 有新 slug），在 Threads 轉貼對方的頁面（取得同意）。
- [ ] 名錄頁 `/vtubers` 說明段加一句「每個團體旁有嵌入按鈕」。（待做）
- [ ] 教學文換成真實截圖後，再發一次「圖文版」貼文。

## 兩個月後檢核（2027-01 初）

| 指標 | 看哪裡 | 期望 |
|---|---|---|
| 嵌入的網站數 | Supabase SQL：`select sum(sites), count(*) from embed_usage;` | ≥ 10 個網站 |
| 外鏈 | GSC「連結」→ 熱門連結網站：出現 Notion／部落格網域 | 有真實外鏈進來 |
| 流量 | GA4：來源＝嵌入宿主站的 referral；事件 `embed_copy`／`embed_download` | 月增 |
| CPU | Cloudflare Pages 指標「超過 CPU 時間限制」 | 不上升 |

**推翻條件**（寫在 Obsidian 決策紀錄）：嵌入站多為自架 WordPress 且 iframe 內連結未被 GSC 計入 → 追加 `<script>` widget；`embed_usage` 持續為 0 而下載數高 → 重心轉圖片。

## 誠實原則

- 「誰在用」只顯示真實的 `embed_usage` 數字；0 的時候顯示「剛上線，還沒有統計」，不灌水、不造假。
- 統計只記宿主站網域，不記 IP、不記使用者；教學裡要寫清楚。
