# TODO

## 筆記

代理 server 啟動指令：wrangler pages dev functions --port 8788
Shadcn UI

最後更新：2026-05-04（統整自各次計畫盤點）

---

## 待新增功能（原始清單）

### [] 1. Twitch 分類搜尋（決議跳過）

### [*] 2. Twitch 使用者追隨頻道匯入

### [*] 3. Feedback 系統

### [*] 4. 快捷鍵功能

### [] 5. 短期觀看串流復原（session restore）

### [*] 6. streambox 模組升級為畫布功能

### [] 7. 網站的主題個人化調整

### [*] 8. 將製作首頁將觀看區域做區分

### [] 9. 訂閱會員付費功能（決議擱置；屬未來 SaaS 路徑）

### [] 10. 小人移動顯示聊天氣泡的趣味功能

### [*] 11. 在畫布功能下提供全螢幕功能

### [] 12. 製作 PWA 功能

### [*] 13. 新增未直播以及正在直播兩個標籤（僅收藏串流使用）

### [*] 14. 聊天室布局更新，添加更多的聊天室布局 6、8、10

### [*] 15. 使用 React GA4 套件來建置，以更精準的追蹤事件

### [] 16. 新增本地語言推送更新功能

### [*] 17. 收藏管理多重編輯

---

## SEO 重做（已全部完成）

### [*] 18. SEO Phase 1-5：title 修正、path prefix 路由、prerender、i18n 文案、OG image
### [*] 19. SEO 第二輪 review：CLS / 301 redirects / canModerate / pg_cron / vtubers.group_id 回填

---

## VTuber 投稿安全層（已全部完成）

### [*] 20. PR 1 Cloudflare Functions 中介層（投稿 / 活動 / Admin 審核）
### [*] 21. PR 2 前端 Dialog 改寫走新 endpoint
### [*] 22. PR 3 AdminPage trust_level 三層把關 + admin_actions audit log
### [*] 23. JWT 改用 Auth REST 相容 ES256

---

## 帳號管理

### [*] 24. PR 4 Identity Linking + 帳號刪除流程（OAuth 連結/解除/刪帳號 cascade）
### [*] 25. PR 5 顯示名稱設定（NFKC normalize + KV 每日改名上限 5 次）
### [*] 26. PR 4 修補：mobile navbar 入口、解除二次確認、verbose error
### [*] 27. LandingPage / VTuberExplorePage user dropdown 補帳號設定入口

### [] 28. PR 6 收藏跨裝置同步（cloudSync.ts + 衝突 dialog + onSignIn 觸發）

### [] 29. PR 7 2FA TOTP（enroll/challenge/verify + backup codes + admin/moderator 強制）

### [] 30. PR 8 紅隊資安測試（雲端，OWASP 15 vector + 修補）

---

## VTuber 探索 UI/UX 進化

### [*] 31. B3+B7+B8 卡片進場 stagger animation + hover 強化 + Skeleton 動畫

### [] 32. B1 vtuber_livestreams 抓取機制
- 需先決定 cron 機制：Cloudflare Worker / Supabase pg_cron+pg_net / GitHub Actions
- Twitch helix /streams 一次最多 100 user_login
- YouTube 用既有 youtube-channel-live.js 邏輯，每次 cron 處理 30 個（rotation）

### [] 33. B2 Hero「現正直播」carousel（依賴 B1）

### [] 34. B4 卡片新增資訊區塊（最近活動 / 訂閱數變化 / 上次直播時間）

### [] 35. B5「為你推薦」分頁（依賴 B1 + 雲端收藏 PR 6）

### [] 36. B6 VTuberDetailSheet 動畫進場 + YouTube/Twitch 雙平台 tab + 訂閱數視覺化

---

## PM 數據驅動建議（GA4 2026/01/01–05/03 統計後發現）

### [] 37. 表單完成率修復（form_start=641 / Submit_success=1，完成率 0.16%）
- 投稿表單：YouTube/Twitch URL 一貼自動抓元資料（oEmbed）
- 活動建立：類型 template 預填時長
- submit 失敗保留草稿到 localStorage

### [] 38. Canvas Onboarding 模板（兩格 / 四格 / 1+3 三選一）
- 解空畫布痛點，依 GA4 Apply_preset 1708 vs Apply_custom 192 證實 user 愛預設

### [] 39.「現正直播 ⚡」浮動側欄（拖拽即新增畫布視窗）
- 依賴 #32 B1 livestreams 抓取

### [] 40. 看過直播自動加進「最近觀看」分類
- 解 Add_favorite=14 過低問題（GA4 顯示 user 不主動加收藏）

### [] 41. navbar 搜尋直接貼 URL = 加收藏 + 開視窗一鍵

### [] 42. 訂閱通知（收藏 VTuber 開播 → 瀏覽器 Notification）

### [] 43. 共看房間 Watch Party MVP（Supabase Realtime + 同步 layout + 房內聊天）

### [] 44. 個人 profile 公開頁 /u/{display_name}

---

## 已知技術債（暫不優先）

### [] 45. lucide-react Twitch / Youtube icon deprecated 全站替換為 Tv / Globe（部分已改 IdentitiesSection）
