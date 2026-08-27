# 教學截圖待補清單

2026-08-27 教學內容重製時，文案已對齊現況，但**截圖沒有重拍**。這份清單記錄哪些圖需要補、每張要拍什麼畫面。

## 怎麼補圖

1. 把 PNG 放進 `image/ToDo/`（這個目錄被 gitignore，是草稿素材區）
2. 在 `scripts/convert-tutorial-images.mjs` 的 `MAP` 加一行：`'你的檔名.png': 'slug'`
3. 跑 `npm run convert-tutorial-images` → 輸出 `public/docs/tutorial/<slug>.webp`（寬度上限 1600、webp q82）
4. 腳本會印出可以直接貼進 `src/components/Pages/InstructionsPage.tsx` 的 `img(...)` 片段（含實際寬高，防 CLS）
5. 圖說與 alt 文字加在 `src/i18n/locales/*/tutorial.ts` 的 `img.<camelCase>.alt` / `.cap`（**五個語系都要**）

---

## A. 已從文章移除，補拍後可以放回來

| slug | 為什麼移除 | 補拍時要拍什麼 |
|---|---|---|
| `window-media-controls` | 拍的是早已不存在的視窗標題列（帶靜音、收合、音量滑桿） | 現在的樣子：游標停在視窗上時浮出的膠囊工具列 —— 拖曳把手＋標題、重新載入、關閉。聊天室視窗再拍一張，它多一個「另開原生聊天室」按鈕 |

移除後 `features.media.window` 這一節目前是純文字。i18n key `img.windowMediaControls.alt` / `.cap` 也一併刪了，補圖時要重新加回五個語系。

## B. 內容仍正確但已經是舊版視覺，值得重拍

這些圖沒有講錯功能，只是動態島與視窗外觀後來調整過。不急，但重拍會更貼近現況：

- `island-*.webp` 全系列（`island-home` / `island-add-window` / `island-search-bar` / `island-layout-picker` / `island-media-control` / `island-favorites-list` / `island-save-canvas` / `island-fullscreen` / `island-clear-canvas` / `island-settings`）—— 動態島現在多了「分享畫布」按鈕，舊圖裡沒有
- `window-drag-resize.webp` —— 標示拖曳把手與四角縮放熱區。現在的把手在浮動膠囊工具列最左邊，不是標題列

## C. 新文章缺圖（目前純文字，讀得通但有圖更好）

| 文章 | 建議畫面 | 建議 slug |
|---|---|---|
| `/instructions/share` | 動態島上的分享按鈕（紅框標示）；複製成功後的 toast「連結已複製」 | `island-share-canvas`、`share-copied-toast` |
| `/instructions/shortcuts` | Ctrl + / 叫出的快捷鍵速查表對話框；某個視窗進入劇場模式後的畫面 | `hotkey-help-dialog`、`theater-mode` |
| `/instructions/dynamic-island`（新增的「邊緣停靠樣式」一節） | 動態島切換成邊緣停靠後，收合成細邊與展開後的兩種狀態 | `island-edge-dock-collapsed`、`island-edge-dock-expanded` |

補上 C 的圖之後，順便把 `src/config/guides.ts` 的 `GUIDE_META['share'].image` 與 `['shortcuts'].image` 換成該篇自己的截圖 —— 目前是先借用既有圖當 `og:image` / `TechArticle.image`。
