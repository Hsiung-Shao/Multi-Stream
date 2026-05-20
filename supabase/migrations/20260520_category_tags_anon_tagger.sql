-- 推薦時選分類 — 匿名 tagger 支援
--
-- Context:
--   Phase C(推薦時選分類)要在 RecommendDialog 加多選分類,讓 user(包含匿名)
--   能在推薦時順手把實況主標分類。匿名推薦 user_id=NULL → 寫入 vtuber_category_tags
--   時 tagged_by=NULL,但原 schema 是 NOT NULL → 撞 NULL violation。
--   對齊 20260517_recs_anon.sql 對 vtuber_recommendations.user_id 的同款處理:
--   讓 tagged_by 改為 nullable。
--
-- 變更:
--   1. tagged_by 改為 nullable
--   2. FK ON DELETE SET NULL 仍維持(本就如此)
--   3. PK (vtuber_id, category_id) 仍維持 → 多人/多匿名 tag 同 pair 撞 PK silent skip
--
-- 資料風險:
--   既有 row tagged_by 都已有值,改 nullable 不影響;只影響未來新 row 可寫 NULL。
--
-- RLS 不動。

alter table public.vtuber_category_tags
    alter column tagged_by drop not null;

comment on column public.vtuber_category_tags.tagged_by is
    '標記者 user_id;匿名推薦時為 NULL。FK ON DELETE SET NULL 仍維持。';

-- ============================================================================
-- 驗證(apply 後手動跑)
-- ============================================================================
-- SELECT is_nullable FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='vtuber_category_tags' AND column_name='tagged_by';
-- → 'YES'

-- ============================================================================
-- Rollback(若需,要先清掉 NULL 列或填 sentinel)
-- ============================================================================
-- update public.vtuber_category_tags set tagged_by = '<sentinel-user-id>' where tagged_by is null;
-- alter table public.vtuber_category_tags alter column tagged_by set not null;
