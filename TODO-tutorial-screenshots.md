# 教學截圖狀態

2026-08-28 更新。

## 已重拍（13 張，真實直播）

用 chrome-devtools 驅動的真實瀏覽器拍攝，內容是**真的在直播**的 Twitch 頻道 `lofigirl`（24 小時開台）與真實聊天室，1440×900、深色主題：

| slug | 內容 | 用在 |
|---|---|---|
| `island-overview` | 畫布全貌＋動態島（含分享按鈕） | quick-start、dynamic-island |
| `island-add-menu` | 「+」展開的三個選項 | canvas |
| `layout-picker-panel` | 布局清單三個分頁與縮圖 | canvas |
| `window-toolbar` | 視窗浮動膠囊工具列（串流版＋聊天室版同框） | canvas、media |
| `media-control-panel` | 總音量＋每一路獨立音量列 | media |
| `share-copied` | 「連結已複製」提示 | share |
| `hotkey-help` | Ctrl + / 的快捷鍵速查表 | shortcuts |
| `theater-mode` | 劇場模式撐滿畫面 | shortcuts |
| `settings-global` | 收藏管理 → 設定（外觀＋播放全部項目） | settings |
| `island-edge-dock` | 邊緣停靠收合成細邊 | dynamic-island |
| `island-edge-dock-open` | 邊緣停靠展開後的直式選單 | dynamic-island |
| `favorites-panel` | 收藏直播面板（四筆、篩選鈕、LIVE 徽章、勾選框） | favorites |
| `empty-window-picker` | 空視窗的串流／聊天室分頁與選台下拉 | canvas |

原始 PNG 在 `image/ToDo/g-*.png`（gitignored），對照表在 `scripts/convert-tutorial-images.mjs` 的 `MAP`。要重跑：`npm run convert-tutorial-images`。

## 還沒拍到的（只剩一張）

| 想拍的畫面 | 為什麼還沒拍 | 建議 slug |
|---|---|---|
| 搜尋框輸入後的**即時結果清單** | Twitch 搜尋要 `.dev.vars` 的憑證，那個檔案只在主工作區（gitignored），worktree 的 wrangler 拿不到；YouTube 那側查 `/api/supabase-config` 也是同一個來源，同樣拿不到 | `search-results-live` |

你自己在正式環境操作時順手截最快。要交給我拍的話，把 `.dev.vars` 複製一份到 worktree 即可（我沒有自作主張搬你的密鑰檔）。搜尋那一段目前沿用舊圖 `search-twitch-results.webp`，內容沒講錯，只是視覺是舊版。

## 仍在使用的舊圖

這些還是舊版視覺，內容沒講錯，不急著換：
`island-search-bar`、`search-twitch-results`、`island-add-window`、`island-layout-picker`、`island-save-canvas`、`island-fullscreen`、`island-clear-canvas`、`island-home`、`island-favorites-list`、`island-media-control`、`island-settings`、`add-window-*`、`custom-layout-*`、`layout-manager`、`favorites-*`、`window-drag-resize`。

`window-media-controls` 已在上一輪從文章移除（拍的是早已不存在的視窗標題列），現由 `window-toolbar` + `media-control-panel` 取代。

## 補圖流程

1. PNG 放進 `image/ToDo/`
2. `scripts/convert-tutorial-images.mjs` 的 `MAP` 加一行 `'檔名.png': 'slug'`
3. `npm run convert-tutorial-images` → 產出 `public/docs/tutorial/<slug>.webp`（寬度上限 1600、webp q82），並印出可直接貼進 `InstructionsPage.tsx` 的 `img(...)` 片段（含實際寬高，防 CLS）
4. alt / 圖說加在 `src/i18n/locales/*/tutorial.ts` 的 `img.<camelCase>.alt` / `.cap`，**五個語系都要**

⚠ 轉檔腳本會檢查 `MAP` 裡**每一個**來源檔都存在，缺一個就整批失敗。worktree 若沒有早期草稿圖，先從主工作區 `image/ToDo/` 複製過來。
