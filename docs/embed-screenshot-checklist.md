# 嵌入教學截圖清單（給使用者：在自己的帳號貼好，我用 Chrome 拍）

前提：功能已推到 next（或 main）。下面的網址把 `<next 網域>` 換成實際站台；slug 用你自己或任一位近期有排程的 VTuber（例：`ribi_yazawa`）。
拍照時我只「看」，不改帳號設定、不替你發文；需要按「發佈」的由你按。

| 平台 | 你要先做的事 | 我要拍的畫面（每平台 2 張） |
|---|---|---|
| Notion | 新頁面 → 輸入 `/embed` → 貼 `https://<站>/embed/schedule/<slug>?lang=zh-TW` → Enter；再貼一次 `…?theme=dark` 比較 | ① 貼網址後的 Embed 選單畫面 ② 頁面裡嵌入顯示出來的樣子 |
| Blogger（或 WordPress／痞客邦任一） | 新文章 → 切 HTML 檢視 → 貼產生器「複製嵌入碼」的整段 → 預覽或發佈 | ① HTML 編輯區貼碼的畫面 ② 公開文章頁看到的嵌入＋下面那行文字連結 |
| Linktree | 產生器「下載週表圖」→ Linktree 新增連結：網址填 `https://multistreaming.org/zh-TW/schedule/<slug>` → 版型 Featured → 上傳剛下載的 PNG 當縮圖 | ① 編輯畫面（Featured 版型＋縮圖） ② 公開的 linktr.ee 頁面 |
| Threads | 新貼文：貼下載的 PNG，文字附 `multistreaming.org/zh-TW/schedule/<slug>`（可不發佈，停在預覽） | ① 貼文編輯畫面（圖＋連結） ② 若已發佈：貼文頁 |
| Instagram／X（選配） | 同 Threads | 同上 |

拍完後我會：裁切 → 轉 WebP（`scripts/convert-tutorial-images.mjs`）→ 放 `public/screenshots/embed/` → 教學文 `/instructions/embed-schedule` 各段換成真圖 → 重跑測試與預渲染。
拍不到的平台在教學裡標「示意」，不冒充真畫面。
