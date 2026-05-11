# GA4 後台手動操作 SOP

> 本文件對應 GA4 修正清單裡所有「無法用程式碼解決、必須在 GA4 後台手動設定」的項目。
> 程式碼端的修改見 PR `feat/ga4-fixes`；本文件是部署後給使用者照表操作的清單。

GA4 後台：[https://analytics.google.com](https://analytics.google.com) → 選 `multistreaming.org` 屬性（measurement ID `G-Q2LXVMDD46`）。

---

## ☐ 1. 命名映射規則（修舊大寫 → 新小寫）

**為什麼**：4.5 個月歷史資料中累積大量大寫事件名（`Page_view`、`Session_pause`、`Heartbeat`、`Apply_preset`...）。新程式已全部小寫。需在後台建「修改事件」規則把舊名改新名，未來報表才會合在一起看。

**怎麼做**：

GA4 → 管理（左下齒輪）→ 資料顯示 → 事件 → **修改事件** → **建立**：

| 規則名稱 | 條件（event_name 等於） | 修改為 |
|---|---|---|
| Rename Page_view | `Page_view` | event_name = `page_view` |
| Rename Session_pause | `Session_pause` | event_name = `session_pause` |
| Rename Session_resume | `Session_resume` | event_name = `session_resume` |
| Rename Heartbeat | `Heartbeat` | event_name = `stream_heartbeat`（注意：新版用 `stream_heartbeat` 取代純 `heartbeat`） |
| Rename Apply_preset | `Apply_preset` | event_name = `apply_preset` |
| Rename Segment_update | `Segment_update` | event_name = `segment_update` |
| Rename User_return | `User_return` | event_name = `user_return` |
| Rename Feature_used | `Feature_used` | event_name = `feature_used` |
| Rename Batch_import | `Batch_import` | event_name = `batch_import` |
| Rename Batch_add_tags | `Batch_add_tags` | event_name = `batch_add_tags` |
| Rename Batch_delete | `Batch_delete` | event_name = `batch_delete` |

**驗證**：規則生效需 24-48 小時後才會在報表合併（即時報表先出現新事件）。

---

## ☐ 2. 標示 6 個關鍵事件（Key Events / Conversions）

**為什麼**：GA4 不知道哪些事件算「轉換成功」。需明確標示。

**怎麼做**：

GA4 → 管理 → 資料顯示 → 事件 → 找下列事件 → 切「**標示為關鍵事件**」開關 ON：

- ☐ `apply_preset`（套用布局是核心使用行為）
- ☐ `apply_custom`
- ☐ `batch_import`
- ☐ `view_search_results`（搜尋成功是 funnel 中段）
- ☐ `first_visit`（GA4 自動）
- ☐ `session_start`（GA4 自動）

> 註：原 checklist 提的 `change_layout` / `add_favorite` 在 main 分支對應的 codebase 不存在（在 dev 分支才有），等 dev 合併後再標。

---

## ☐ 3. 不需要的轉介來源（Unwanted referrals）

**為什麼**：OAuth、CDN preview、Google Tag Assistant 跳轉回來會被算成新工作階段，污染來源報告。

**怎麼做**：

GA4 → 管理 → 資料串流 → 點選 `multistreaming.org` 串流 → **設定代碼** → 顯示更多 → **不需要的轉介來源** → 加入：

- `auth.twitch.tv`
- `id.twitch.tv`
- `accounts.google.com`
- `discord.com`
- `cloudflareaccess.com`
- `pages.dev`
- `tagassistant.google.com`

---

## ☐ 4. 關閉強化評估的「瀏覽記錄變更」（避免雙計）

**為什麼**：本專案是 SPA，page_view 由 [src/utils/analytics.ts](../src/utils/analytics.ts) 的 `logPageView()` 在路由變更時手動送（已設 `send_page_view: false` 防初始自動送）。若 GA4 強化評估的「瀏覽記錄變更」也在偵測 SPA 路由送 page_view，會雙計。

**怎麼做**：

GA4 → 管理 → 資料串流 → `multistreaming.org` → **強化評估** → 點齒輪 → 把「**瀏覽記錄變更**」**關閉**。

> **「網頁瀏覽」總開關保留 ON** — 不影響我們手動送的 page_view 接收。
> 「捲動」「外連」「網站搜尋」等其他子項可依需要保留或關閉。

---

## ☐ 5. 串接 Google Search Console

**為什麼**：自然搜尋帶來流量很少（4.5 個月才 33 人），但無法知道是哪些關鍵字曝光、哪些有排名沒點擊。串接後可在 GA4 的「Search Console」報表直接看。

**怎麼做**：

GA4 → 管理 → 產品連結 → **Search Console 連結** → 連結 → 選擇 multistreaming.org 的 Search Console 屬性 → 選資料串流 → 提交。

如果還沒有 Search Console 屬性，先去 [https://search.google.com/search-console](https://search.google.com/search-console) 用 DNS 或 HTML 標籤驗證網域。

---

## ☐ 6. 過濾內部測試流量

**雙保險**：程式碼端已用 `isInternalEnvironment()` 自動跳過 localhost / `*.pages.dev` / `localStorage['ms_internal_user']='1'`。GA4 後台再加一層 IP 過濾，防漏。

**怎麼做**：

GA4 → 管理 → 資料設定 → **資料篩選器** → **建立篩選器**：

- 篩選器名稱：`Internal Traffic - Developer`
- 篩選器類型：**內部流量**
- 條件：`traffic_type` 等於 `internal`
- 篩選器狀態：**啟用**

然後設定「內部流量」規則：

GA4 → 管理 → 資料串流 → `multistreaming.org` → **設定代碼** → 顯示更多 → **定義內部流量** → **建立**：

- 規則名稱：`Developer Home`
- traffic_type 值：`internal`
- IP 位址：填你自己的固定 IP（用 [https://www.whatismyip.com](https://www.whatismyip.com) 查）

---

## ☐ 7. 建立 4 個自訂維度（user-scoped）

**為什麼**：[src/utils/analytics.ts](../src/utils/analytics.ts) 的 `setUserProperties()` 已在送 visitor_type / visit_frequency / feature_depth / session_length 四個 user properties，但**未在後台登錄為自訂維度** → 只能在 DebugView 看到、報表跟探索都看不到。

**怎麼做**：

GA4 → 管理 → 資料顯示 → **自訂定義** → **建立自訂維度** → 重複 4 次：

| 維度名稱 | 範圍 | 使用者屬性 |
|---|---|---|
| Visitor Type | 使用者 | `visitor_type` |
| Visit Frequency | 使用者 | `visit_frequency` |
| Feature Depth | 使用者 | `feature_depth` |
| Session Length | 使用者 | `session_length` |

設好之後，GA4 探索可用這些維度切資料。注意：上限 25 個 user dimensions，目前用 4 個。

---

## ☐ 8. 800x600 解析度區隔（探索報表用）

**為什麼**：歷史 145 個使用者用 800x600（2026 年幾乎沒真人這解析度），疑似爬蟲。在探索報表建區隔可排除。

**怎麼做**：

GA4 → 探索 → 任一探索報表 → 左側「區隔」→ **+** → **使用者區隔** → 條件：`screen_resolution` 不等於 `800x600` → 命名「Real users (excl. 800x600)」→ 套用。

---

## ☐ 9. 建立漏斗探索

**怎麼做**：

GA4 → 探索 → 範本庫 → **漏斗探索** → 設定四步驟：

1. `session_start`（任何工作階段開始）
2. `page_view` where `page_path == /tools`（進到工具頁）
3. `apply_preset`（套用任一布局）
4. `stream_start` where `is_first_stream == true`（開了第一個直播）

看每步驟的轉換率，找最大流失點。

---

## ☐ 10. 設「報告身分」

**為什麼**：`setUserIdFromTwitchId()` 已將 Twitch user 的 SHA-256 hash 設為 GA4 user_id。需要在後台告訴 GA4 「以使用者為主」識別跨裝置。

**怎麼做**：

GA4 → 管理 → 資料顯示 → **報告身分** → 切換到 **「以混合方式」** 或 **「以觀察結果為準」**（建議混合，會綜合 user_id + Google 訊號 + 裝置 ID）。

> 此項待 dev 分支合併後（Twitch OAuth 上線、會真的呼叫 setUserIdFromTwitchId）再做更有意義；目前可先設好。

---

## 完成順序建議

1. 先做 #4（關閉強化評估瀏覽記錄變更）+ #6（IP 過濾）→ 立刻減少污染
2. 部署本 PR + 完成 [Zaraz 停用](./ga4-zaraz-disable.md) → 讓 native gtag 接管
3. 24-48 小時後做 #1（命名映射規則）→ 統一報表
4. 做 #7（自訂維度）+ #2（關鍵事件）→ 報表才有意義
5. 做 #5（Search Console）+ #3（轉介排除）→ 來源報告變乾淨
6. 一週後資料累積夠 → 做 #8（區隔）+ #9（漏斗）做分析
