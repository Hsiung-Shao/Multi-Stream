# HANDOFF：靜態頁預渲染（SSG）

**建立日期**：2026-08-27
**來源**：分支 `claude/homepage-links-canvas-perf-5f573e` 的第四部分。那一輪把能在 CSR 架構內做完的都做了，剩下的事必須改架構，所以拆出來。
**狀態**：未動工，只有調查結果與建議作法。

---

## 為什麼要做

兩個看似無關的問題，根因是同一個。

### 1. `/faq`、`/compare` 在 GSC 是「已檢索 — 目前尚未建立索引」

實測 production（2026-08-27）：

```bash
curl -s https://multistreaming.org/faq | wc -c   # 8111
```

回給爬蟲的 HTML 只有 8 KB，`<body>` 是空殼——`functions/[[path]].js` 用 HTMLRewriter 注入了正確的 `title` / `description` / `canonical` / `og:*`，但**沒有任何內文**。Google 會檢索、放進 render queue，然後在配額與品質判斷下遲遲不建立索引。首頁因為外部連結與品牌詞夠強撐得住，內頁撐不住。

順帶記錄：使用者原本一起提報的另外三項，實測**都已經是對的**，不需要改程式，是 GSC 的舊快取資料：

| GSC 回報 | 實測 |
|---|---|
| `http://multistreaming.org/` 頁面會重新導向 | `301 → https://multistreaming.org/`（正常行為） |
| `/privacy.html` 未建立索引 | `301 → /privacy`（`functions/[[path]].js` 的 `REDIRECTS`） |
| `/?search={search_term_string}` 未建立索引 | production HTML 已無 `search_term_string`；`SearchAction` 在 commit `53043b28` 移除 |

### 1b. 2026-09-04 更新：GSC「網頁索引」報表數字（使用者匯出）

| GSC 分類 | 數量 | 對應的頁 | 解讀 |
|---|---|---|---|
| 已建立索引 | 7 | `/`、`/instructions`、`/about`、`/faq`、`/privacy`、`/canvas`、`/support` | 與成效報表「有曝光的 7 頁」完全吻合。**`/faq` 已經被收錄**（上一版 HANDOFF 寫它未索引，已過時） |
| 已找到 - 目前尚未建立索引 | 8 | 7 篇教學文章 + `/about/creator` | 08-21 Phase 3 上線，08-22 未索引數從 5 跳到 12。「驗證已開始」= Google 排隊中，不是被拒 |
| 已檢索 - 目前尚未建立索引 | 3 | `/compare` + `/privacy.html` + `/?search=`（後兩條已 301／已移除） | **真問題只剩 `/compare`**：爬過、判定內容太薄。這就是本文件要解的那個問題 |
| 頁面會重新導向 | 1 | `http://multistreaming.org/` | 正常 301 |

分支 `claude/homepage-links-canvas-perf-5f573e` 09-04 已把 `/compare` 從「全站零內鏈」補到「每頁 footer 都有」（`SiteFooter`），sitemap 也多了 2 篇新文章；**但這些要 push 部署後 GSC 才看得到**。預期：教學文章排到爬之後會撞同一面空殼牆，所以 SSG 仍是必要的，內鏈只是前置。

使用者 09-04 決定：**SSG 在新 session 依本文件開工**。

### 2. 行動裝置 LCP 卡在 CSR 天花板

Chrome DevTools 效能追蹤（production build、純 Node static server + gzip、4x CPU 節流、Slow 4G、412×823）：

```
LCP  2644 ms   TTFB 2 ms   Render delay 2641 ms
CLS  0.00
```

**CLS 已經是良好**（0.00，門檻 0.1），不必動。
**LCP 的 2.64 秒有 2.64 秒是 render delay** —— TTFB 只有 2 ms（本機），時間全花在「下載 JS → 解析 → React 渲染出第一屏」。這就是 CSR 的形狀：HTML 沒有內容，什麼都得等 JS。

專案記憶（`error_lighthouse_measurement_env`）也記載過實驗室分數 desktop 99 / mobile 81–83，且明確寫著「mobile 效能是 CSR 天花板，要再上去需 SSR/SSG」。

首頁載入的 JS：`index-*.js` 634 KB（gz 190 KB）+ `vendor-radix` 284 KB（gz 91 KB）+ `vendor-utils` 136 KB（gz 37 KB）+ `vendor-react` 44 KB（gz 14 KB）≈ **gz 330 KB**。`vendor-charts`（recharts，gz 111 KB）確認沒有載進首頁。

---

## 目標

把下列路由預渲染成**帶內文的實體 HTML**，`/canvas` 維持 CSR（它是應用程式，不是內容頁）：

```
/  /about  /about/creator  /faq  /privacy  /support  /compare
/instructions
/instructions/{quick-start,canvas,search,dynamic-island,favorites,media,settings,share,shortcuts}
```

slug 清單的單一來源是 `src/config/guides.ts` 的 `GUIDE_SLUGS`（`scripts/generate-sitemap.js` 已經改成解析這個檔，別再手抄第二份）。

---

## 建議作法

`vite build` 之後，用 Playwright 對本機 static server 逐路由快照，把渲染後的 HTML 寫回 `build/<route>/index.html`。不換框架、不動現有元件結構。

### 必須處理的接點

1. **`src/main.tsx` 改 `hydrateRoot`**
   偵測 `#root` 是否已有內容：有 → `hydrateRoot`，沒有 → `createRoot`（`/canvas` 與任何沒預渲染到的路徑走這條）。
   注意現有的 `ensureLanguageLoaded(i18n.language).finally(...)` 包裝：hydration 前語言資源必須已經載入，否則首次 render 的字串與預渲染 HTML 不一致 → hydration mismatch。

2. **`public/_routes.json` 排除已預渲染的路徑**
   目前 `functions/[[path]].js` 是 catch-all，會攔所有 HTML 路由。預渲染後這些路徑應該直接吃靜態檔，不再進 Function（省呼叫數，也避免 HTMLRewriter 改到已經正確的 meta）。

3. **`functions/[[path]].js` 與預渲染 HTML 的分工**
   建議：預渲染 HTML 自帶正確的 `title` / `description` / `canonical` / `og:*` / JSON-LD（`SEO.tsx` 本來就會寫，快照時已經在 DOM 裡）；Function 只保留**真 404** 與 **301 舊路徑**（`/tools`、`/index.html`、`/about.html`、`/privacy.html`）與尾斜線正規化。
   ⚠ `_headers` 不套用到 Function 回應，安全標頭目前靠 `functions/lib/security-headers.js` 帶。改成走靜態檔之後，這些路徑會改吃 `_headers` —— **必須確認兩邊標頭一致**，`tests/functions/seoEdge.test.ts` 有鎖 `HTML_SECURITY_HEADERS` 與 `_headers` 的同步，別讓它失效。

4. **i18n：預渲染要烘哪個語言**
   `functions/[[path]].js` 目前用 `Accept-Language` 二分 `zh-TW` / `en`（含 zh 變體 → zh-TW，其餘 → en）。
   建議預渲染同樣產兩份（`build/<route>/index.html` 與 `build/<route>/index.en.html` 之類），由 Function 依 `Accept-Language` 挑檔——這樣就不必在 `_routes.json` 排除，Function 保留但只做選檔＋301＋404。
   若嫌複雜，退而求其次只烘 `en`（GSC 查詢資料顯示曝光幾乎全是英文長尾：multistream viewer / watch multiple twitch streams / multitwitch），中文使用者 hydration 後會換成中文，代價是首屏閃一下。**這個取捨要先問使用者。**

5. **測試接線**
   `tests/functions/sitemap.test.ts` 會實際跑一次產生器並比對 `PAGE_PATHS`；`tests/functions/seoEdge.test.ts` 會比對 `ROUTE_META` ↔ locale `seo.ts` ↔ `_headers`。改路由分工時這兩支是安全網，要讓它們持續綠。

---

## 已知地雷（踩過，別再踩）

- **不要在 `index.html` 的 `#root` 內塞靜態骨架**。試過：(a) Lighthouse 預設 simulated throttling 不認列，只 +2 分，到不了 95；(b) dev server 不送 charset header，加上 Console Ninja 會注入約 70 KB inline script 把 `<meta charset>` 擠出前 1024 bytes → 瀏覽器用錯編碼解析靜態 HTML 的中文 → **可見的亂碼閃現**。已還原。要拉效能請走正式預渲染，不要走骨架 hack。
- **量測環境**（同一則記憶）：必測 production build，不要用 vite dev / vite preview（Console Ninja 會掛 vite plugin）；static server **必須 gzip**，不 gzip 時 Lantern 用未壓縮 transfer size 估算，FCP/LCP 會暴增（此案曾 8.4s → 3.3s 的差就是 gzip）；Lighthouse CLI 要加 `--chrome-flags="--no-proxy-server"` 避開 Cloudflare WARP 攔截 localhost。
  本輪用的量測 server 很短，可以照抄：純 Node、SPA fallback、可壓縮型別一律 gzip。

---

## 順帶可做（不預渲染也有效，但建議跟預渲染同一輪測）

- **拆 `vendor-radix`**：`vite.config.ts` 的 `manualChunks` 把 10 個 Radix 套件綁成一塊（gz 91 KB），只要入口圖有任何一個就整塊載入。首頁其實只用到 Select 與 Accordion。拿掉這組手動分組、讓 Rollup 依路由自然切，首頁 JS 應該可以明顯變小。要量測前後。
- **Inter 字型在關鍵路徑上**：`HTML → index.css → inter-latin-wght-normal.woff2`，鏈長 2041 ms。目前 `font-display: swap` 有生效（LCP 在字型下載完成前就畫出來了），所以**不影響 LCP**，只是會晚一點換字。加 `<link rel="preload" as="font" crossorigin>` 可以提早約 640 ms，但在慢速網路上會與首屏資源搶頻寬——**要 A/B 量測再決定，不要盲加**。

---

## 完成後要做的事

1. 部署到 production（`main`）。
2. **等 5 分鐘**再測（Cloudflare Pages build + dev alias swap 需要時間，提早測會撞舊版 cache）。
3. 用 `curl -s https://multistreaming.org/faq | wc -c` 確認 HTML 真的帶內文了。
4. 跑 `npm run indexnow`（會讀 repo 根的 `sitemap.xml`）通知支援 IndexNow 的搜尋引擎。
   ⚠ **一定要部署完才跑**。本輪新增的 `/instructions/share`、`/instructions/shortcuts` 在 production 還是 404，提前提交等於叫爬蟲去撞 404。
5. GSC 對 `/compare` 與 9 篇 `/instructions/<slug>` 手動「要求建立索引」（`/faq` 09-04 已被收錄，不用再提）。
6. CrUX 是 28 天滾動窗，網頁體驗報表要等資料回填，不要當天就下結論。
