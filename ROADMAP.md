# MultiStream Hub — `next` 分支開發路線圖

> 本分支 `next` 從 `main` 重新分出,作為乾淨的下一版開發主線。
> 策略:**保留 `main` 的基礎建設(native gtag GA4、精簡結構),用「檔案層級複製」方式從 `dev` 選擇性移植功能**,避開 `dev` 上龐大且線性堆疊的耦合(推薦系統 / 2FA / 帳號系統 / SEO prerender)。

---

## 分支與基礎設施基準

| 項目 | 採用 |
|---|---|
| 起點 | 從 `main`(`2999698`)分出 |
| GA4 / analytics | **保留 `main` 的 native gtag**(`src/utils/analytics.ts`,含 `track.*` + 向後相容 `logEvent`) |
| 移植方式 | `git checkout dev -- <path>` 檔案層級複製,重新 commit(不保留原 commit 歷史) |
| 遠端 DB | 與 `main`/`dev` **共用同一個 Supabase 專案** — 不對既有表做破壞性 RLS 變更 |

⚠️ **共用 DB 注意**:`announcements`、`announcement_responses`、`youtube_channels` 表與 RLS 在遠端**已存在且就緒**(dev 開發期建立)。本分支沿用,不新增 migration、不改 RLS。

---

## Phase A — 已完成(本次)✅

### A1. 通知推送系統(投票 / 意見詢問 / 公告通知)
**狀態:前端整合已驗證;API 端到端待部署 preview 驗證。**

- **使用者端(完整移植)**:`src/features/announcements/*`(Toast / PollModal / SurveyChip / Provider / api / deviceId / storage / types),已掛載於 `App.tsx` 與 `MobileApp.tsx`。匿名以 `deviceId` 回應,登入則帶 token。
- **後端**:`functions/api/announcements/{active,respond,[id]/results}.js` + `functions/lib/announcements.js`(+ 共用 `cors`/`rate-limit`/`supabase-server`/`logger`/`auth-helper`)。全走 `service_role`。
- **admin 簡易保護(已去除 2FA 耦合)**:`functions/api/admin/announcements.js` 與 `.../[id]/responses.js` 的身份檢查由 `requireAdminTrust`(aal2)**改為 `ADMIN_API_TOKEN`**(`X-Admin-Token` header)。`created_by` 改為 `null`(欄位本就 nullable)。**未動帳號系統 / 2FA / DB RLS。**
- **i18n**:`announcements` namespace 已註冊(5 語系暫指向 zh-TW 版,見「待補」)。

**發布公告用法(admin)**:
1. 在 Cloudflare Pages 設環境變數 `ADMIN_API_TOKEN`(自訂強隨機字串)。
2. `POST /api/admin/announcements`,header `X-Admin-Token: <token>`、`Content-Type: application/json`,body 例:
   ```json
   { "type": "poll", "title": "你最想看哪種聯動?", "status": "published",
     "payload": { "multi_select": false, "options": [{"id":"a","label":"音樂"},{"id":"b","label":"遊戲"}] } }
   ```
   `type` ∈ `announcement | poll | survey`。

### A2. YouTube 頻道離線資料庫
**狀態:前端整合已驗證;寫入端到端待部署 preview 驗證。**

- `src/features/youtube/YouTubeChannelRepository.ts` + `functions/api/youtube/cache-channel.js` + `functions/lib/youtube-channel-cache.js`。
- **觸發點**:`src/store/useStreamStore.ts` 的 `addStream`,在載入 YouTube 頻道時 fire-and-forget 呼叫 `upsertChannel({ channel_id, channel_title })`,把 `channelId ↔ 頻道名`寫進 `youtube_channels`(service_role,匿名可寫)。涵蓋 videoId 路徑(`info.channelTitle`)與 channelId 路徑(反查 title)。
- 可擴充:收藏 YouTube 頻道時也觸發(目前在「載入觀看」時觸發已涵蓋主要情境)。

### 後端環境變數需求(Cloudflare Pages)
| 變數 | 用途 | 必要 |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | announcements + youtube 後端寫入 | ✅ |
| `ADMIN_API_TOKEN` | admin 發布公告保護 | ✅(發布時) |
| `RATE_LIMIT_KV` | respond 防濫用(fail-open) | 選用 |

### 驗證狀態
- ✅ 本機 `npm run dev` 啟動成功;移植/修改檔案 `tsc --noEmit` 零錯誤(全專案 235 個為 main 既有問題,與本次無關)。
- ✅ 首頁載入正常、`AnnouncementsProvider` 掛載運作、API 不存在時 fail-open 不崩潰、UI 渲染正常。
- ⬜ **待部署 preview**:設好上述 env 後,驗證公告 toast/poll/survey 顯示與回應、`cache-channel` 寫入 `youtube_channels`、admin token 發布。

---

## Phase B — UI 功能重新設計(已設計,待實作)🎨

**範圍**:整個導覽列重設計 + 設計 token 化(純前端,無 DB)。
**來源(dev)**:`src/index.css`(oklch 設計變數)、`src/components/Navigation/*`(`DynamicIsland`、`IslandFavoritesMenu`、`MediaControlPanel`、`IslandLayoutPicker`、`IslandSearch`、`StreamListItem`)。

**建議順序**:
1. 移植設計 token(`src/index.css` 的 CSS 變數 / 語意色)——先建立視覺基礎。
2. 逐元件移植 Navigation,對齊 `main` 既有結構;注意與收藏系統共用的 `IslandFavoritesMenu` 接點。
3. Mobile 外殼(`src/components/Mobile/*`)視需求對齊。

**驗收標準**:桌面/手機導覽列符合設計稿、深淺主題 token 一致、既有功能(搜尋/收藏/布局/媒體控制)行為不變。
**估時**:2–3 人天(視要不要連動 Mobile 4→5 tab 重構)。

---

## Phase C — 短暫播放回復(需釐清 + 設計)🔄

**需求**:使用者不小心切換頁面後,回復原本觀看的內容、布局、頻道位置。

**現況**:`dev` 的 `useCanvasRetention.ts` 只是「追蹤停留時間發 GA4 事件」,**並未實作回復**。`useStreamStore` 已用 zustand persist 把 `streams / layout / canvasItems` 存 localStorage,缺「啟動時自動復現」邏輯。

**⬜ 待釐清(實作前需確認觸發情境)**:
- (a) app 內切換頁面(如 canvas → about)再回來 → 靠 in-memory state 保留即可
- (b) 切到瀏覽器其他分頁再回來 → 通常 state 仍在,可能只需 visibility 處理
- (c) 重新整理 / 關閉分頁後再開 → 需 localStorage persist + 啟動復現

**設計方向**:沿用既有 persist;在 App 初始化(`useAppInitialization`)補「讀取最後布局 + 頻道位置並復現」;切頁保留 in-memory。
**估時**:2–3 人天(視情境 (c) 範圍)。

---

## Phase D — PWA(從零設計,待實作)📱

**現況**:僅有 `manifest.json`;**無 service worker、無 vite-plugin-pwa、無 offline、無安裝提示**。

**設計**:
1. 導入 `vite-plugin-pwa`(或手寫 SW),產生 service worker。
2. App shell offline 快取策略(precache 靜態資源;直播 iframe 本質不可離線)。
3. `beforeinstallprompt` 安裝提示 UI。
4. 沿用既有 `manifest.json`(icon / theme_color 已備)。

**驗收標準**:Lighthouse PWA 通過、可安裝、離線可開殼層。
**估時**:2–4 人天。

---

## 跨階段待辦
- **i18n 翻譯**:`announcements` 目前 5 語系共用 zh-TW;後續補 zh-CN / en / ja / ko 翻譯(`src/i18n/locales/<lang>/announcements.ts` + `i18n.ts` 指向各自版本)。
- **admin 後台 UI**:目前公告發布僅後端 token endpoint;後續可做極簡 admin 發布介面(輸入 token)。
- **部署 preview 端到端驗證**:Phase A 兩功能需在 Cloudflare Pages preview 設好 env 後完成最終驗證。

---

## 進度總覽
| Phase | 功能 | 狀態 |
|---|---|---|
| A1 | 通知推送(投票/意見/公告) | ✅ 已移植,待 preview 驗證 |
| A2 | YouTube 頻道離線資料庫 | ✅ 已移植,待 preview 驗證 |
| B | UI 重新設計 | 📐 已設計,待實作 |
| C | 短暫播放回復 | 📐 已設計,待釐清情境 |
| D | PWA | 📐 已設計,待實作 |
