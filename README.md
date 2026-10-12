# MultiStream Hub

免費的多直播同時觀看工具，Twitch 和 YouTube 可以一起開，最多 16 路，還有台灣 VTuber 的開台週表。

🌐 **線上版本**：[https://multistreaming.org/](https://multistreaming.org/)

## 這是什麼

MultiStream Hub 由 Hsiung-Shao 獨立開發與維護。起因很單純：同時追好幾位實況主的時候，開一堆分頁切來切去實在很麻煩，所以做了一個能把直播全部擺在同一個畫面上看的工具。

打開就能用，不用註冊。收藏、版面和設定都存在你自己的瀏覽器裡。

## ✨ 主要功能

### 🎥 多開畫布

- Twitch、YouTube 直播混著開，最多 16 路
- 自由畫布：視窗可以拖曳、縮放，放大時旁邊的視窗會自動讓位；關掉視窗後，空出來的位置會自動補上
- 內建多種版型，會依螢幕比例填滿畫面，不留大片空白；`Alt + 數字` 快速切換
- 聊天室可以跟著直播一起擺，也可以 2～4 路共用一個聊天室，用下拉選單切換要看哪一路
- 聊天室能另開視窗，瀏覽器擋第三方 Cookie、內嵌聊天室沒辦法發言時也能正常聊天
- 下方「動態島」集中放搜尋、新增視窗、版面設定、全部靜音等操作，也可以改成貼齊螢幕左右邊緣
- 每一路可以各自調音量，也能一鍵全部靜音
- 10 分鐘內重新開啟網站，會詢問要不要恢復上次的畫面
- 「分享畫布」會複製一條連結，朋友點開就是同一組直播

### 📅 開台週表

- 台灣 VTuber 現在誰在開、接下來 7 天的待機室、剛結束的直播，一頁看完
- 可以依地區、所屬公司、平台、「我的收藏」篩選，勾選幾位就能一鍵送進畫布一起看
- 沒開待機室的實況主，貼在 YouTube 社群的週表圖片也會整理成場次
- 每位 VTuber 都有自己的週表頁，YouTube 和 Twitch 的場次合併顯示
- 沒收錄的 VTuber 可以投稿新增；資料有錯、想補週表或補社群連結，也能直接在個人頁送出，站方確認後更新

### ⭐ 收藏管理

- 常看的頻道一鍵收藏，可以加多個標籤、分資料夾整理
- 自動偵測收藏頻道有沒有在直播，空畫布會直接列出正在直播的收藏
- 輸入頻道名稱就能搜尋，不一定要貼網址
- 連結 Twitch 帳號後可以匯入你追隨的頻道
- 備份／還原：收藏、標籤、自訂版面一起匯出成 JSON 檔，換電腦也能完整搬過去
- 「清除所有資料」一鍵清掉本站存在這個瀏覽器的所有東西

### 📊 其他

- 繁中、簡中、英文、日文、韓文五種介面
- 手機版有專屬介面，不是把桌機版硬縮小
- 教學頁、FAQ 和比較頁，新手也能很快上手
- 公開的[系統狀態頁](https://multistreaming.org/status)，可以看各項排程和資料更新是否正常

## 🚀 本地開發

前端用 React + Vite，後端是 Cloudflare Pages Functions 加 Supabase。只想改畫面的話，跑前端就夠了；週表、搜尋、回饋這類功能需要後端才會有資料。

### 1. 安裝與啟動

```bash
git clone https://github.com/Hsiung-Shao/Multi-Stream.git
```

```bash
cd Multi-Stream
```

```bash
npm install
```

```bash
npm run dev
```

啟動後打開終端機顯示的網址（通常是 `http://localhost:5173`）。

### 2. 跑測試

```bash
npx vitest run
```

測試用 Vitest + jsdom，目前約 100 個測試檔、1300 多條測試，全部跑完大約 20 秒。

### 3. 建置正式版

```bash
npm run build
```

建置會依序產生 sitemap、打包前端、預渲染靜態頁（教學、FAQ、關於等頁面），輸出在 `build/`。

### 4. 後端環境變數（需要時再設）

Cloudflare Pages Functions 讀根目錄的 `.dev.vars`（已加入 `.gitignore`，不會被提交）。會用到的變數：

| 變數 | 用途 |
|---|---|
| `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` | 資料庫連線 |
| `TWITCH_CLIENT_ID`、`TWITCH_CLIENT_SECRET` | Twitch API |
| `TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`、`ENFORCE_TURNSTILE` | 投稿與回饋的機器人驗證 |
| `IP_HASH_SALT` | 回報與投稿防灌水（只存雜湊，不存 IP） |
| `ADMIN_API_TOKEN` | 站方後台 |

資料庫 migration、Edge Functions 與本地 seed 都在 `supabase/` 底下，可以用 Supabase CLI 在本機起一套來測。

## 📁 專案結構

```
Multi-Stream/
├── src/
│   ├── components/      # 畫布、動態島、各頁面與共用 UI（Shadcn/UI）
│   ├── features/        # 功能模組：收藏、週表、備份、公告、回饋、狀態頁、Twitch、YouTube…
│   ├── store/           # Zustand 狀態（串流、版面）
│   ├── hooks/           # 共用 hooks
│   ├── i18n/            # 五種語言的翻譯
│   ├── config/          # 站外連結、版本紀錄等設定
│   └── entry-server.tsx # 預渲染用的 SSR 入口
├── functions/           # Cloudflare Pages Functions（/api/*、個人週表頁 SSR）
├── supabase/            # migration、Edge Functions（週表排程）、seed
├── scripts/             # 建置、預渲染、sitemap、資料匯入等腳本
├── tests/               # Vitest 測試
└── public/              # 靜態資源
```

## 🛠️ 技術棧

- **前端**：[React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- **樣式**：[Tailwind CSS](https://tailwindcss.com/) + [Shadcn/UI](https://ui.shadcn.com/)（Radix UI）
- **狀態與資料**：[Zustand](https://github.com/pmndrs/zustand)、[TanStack Query](https://tanstack.com/query/latest)
- **後端**：Cloudflare Pages Functions、[Supabase](https://supabase.com/)（PostgreSQL、Edge Functions、pg_cron）
- **測試**：[Vitest](https://vitest.dev/)
- **部署**：Cloudflare Pages

## 📄 授權

本專案以 [PolyForm Noncommercial License 1.0.0](LICENSE.md) 授權，© 2025-2026 Hsiung-Shao。

- ✅ 可以：閱讀、學習、個人使用、修改，以及非營利目的的再散布
- ❌ 不可以：任何商業用途（含架設營利網站、付費服務、嵌入商業產品）
- 再散布時須附上授權條文與 `Required Notice` 著作權聲明

商業授權請透過[意見回饋表單](https://forms.gle/AjG922YrXFbyAdBa6)聯繫。

## 🤝 意見回饋與貢獻

功能會持續改進，也很歡迎大家提供意見和建議！

- 網站右下角的回饋按鈕可以直接送出意見
- 想聊天或回報問題，歡迎加入 [Discord](https://discord.gg/47kauArepY)
- 也歡迎在 GitHub 開 Issue 或送 Pull Request

覺得好用的話，給個星星或分享給一起追直播的朋友，就是最大的支持 ❤️

## 📚 版本紀錄

完整的更新歷史請看網站上的「版本紀錄」。最近幾版：

- **v3.8.0**（2026-10-08）：週表新增「社群週表」，可以從社群貼文整理場次；個人頁可以幫忙提供週表
- **v3.7.0**（2026-10-04）：備份包含自訂版面、新增「清除所有資料」、五種語言翻譯補齊、教學全面更新
- **v3.6.0**（2026-10-02）：新增台灣 VTuber 開台週表與個人週表頁，可以投稿新增 VTuber
- **v3.5.0**（2026-09-27）：多路共用聊天室、版型填滿畫布、第一次使用的導覽、搜尋框升級

---
Made with ❤️ by Hsiung-Shao
