-- 分類提案精簡 — 移除 description 欄位
--
-- Context:
--   20260517 之前的設計 ProposeCategoryDialog 讓 user 填 name + slug + description,
--   slug 屬系統設計細節不該 user 操心,description 對使用者無實質價值。
--   本次重構同時:
--     1. slug 改為 server 自動產(see functions/api/categories.js generateCategorySlug)
--     2. description 欄位整個拿掉(本 migration)
--   兩件事各自獨立,本檔只處理 description 欄位。
--
-- 變更:
--   1. drop column description (text NULLABLE, 既有 CHECK length<=200)
--   2. CHECK constraint vtuber_categories_description_check 隨欄位 drop 自動消失
--
-- 資料風險:
--   apply 前表內 0 row,零資料風險。
--
-- RLS 不動。三條 policy 維持原樣。

alter table public.vtuber_categories drop column if exists description;

-- ============================================================================
-- 驗證(apply 後手動跑)
-- ============================================================================
-- SELECT count(*) FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='vtuber_categories' AND column_name='description';
-- → 0
--
-- SELECT count(*) FROM pg_constraint WHERE conname='vtuber_categories_description_check';
-- → 0

-- ============================================================================
-- Rollback
-- ============================================================================
-- alter table public.vtuber_categories add column description text;
-- alter table public.vtuber_categories
--     add constraint vtuber_categories_description_check
--     check (description is null or length(description) <= 200);
