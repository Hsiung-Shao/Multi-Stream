-- 清理孤兒表:posts / post_reports
--
-- 背景:完整 schema + RLS 存在,但對全部本地分支(next/dev/main/4 個 feat/*/security/*)
-- 與全部 commit 歷史做 git log -S pickaxe 搜尋,確認零 commit 寫過對應應用程式碼。
-- 欄位設計(event_type/event_date/related_vtuber_ids)顯示這是規劃「VTuber 社群活動
-- 貼文 + 檢舉」功能時的早期 schema,後來被更明確的 vtuber_events(已確認活躍使用)取代。
-- 兩張表皆為 0 筆資料,無資料遺失風險。
--
-- 已於 2026-07-06 與使用者確認查證過程與清理範圍後執行。

DROP TABLE IF EXISTS public.post_reports;
DROP TABLE IF EXISTS public.posts;
