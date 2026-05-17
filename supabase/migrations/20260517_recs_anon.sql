-- 推薦表開放匿名 — user_id 可為 NULL + 部分 UNIQUE
--
-- Context:
--   20260517_vtuber_recommendations.sql 原本要求 user_id NOT NULL
--   + UNIQUE(vtuber_id, user_id),以「一個 user 對一個 vtuber 一票」為前提。
--   feat/vtuber-recommendations 流程改為允許匿名(未登入)推薦,
--   因此 user_id 必須允許 NULL;同時 UNIQUE 也必須改成 partial,
--   只在 user_id IS NOT NULL 時阻擋同一 user 重複推。
--
-- 變更:
--   1. user_id 改可 NULL(匿名推薦)
--   2. 移除原有 UNIQUE constraint (vtuber_id, user_id)
--   3. 改建 partial UNIQUE index,僅在 user_id IS NOT NULL 時生效
--      → 匿名推薦不互相阻擋;登入 user 仍受「一票」限制
--
-- RLS 不動。三條 policy 維持:
--   - public_select (USING true)
--   - self_insert (WITH CHECK user_id = auth.uid())
--   - self_delete (USING user_id = auth.uid())
-- 匿名 INSERT 由 endpoint 用 service_role 寫入,繞過 RLS。

alter table public.vtuber_recommendations
    alter column user_id drop not null;

alter table public.vtuber_recommendations
    drop constraint if exists vtuber_recommendations_vtuber_id_user_id_key;

create unique index if not exists vtuber_recommendations_vtuber_user_uniq
    on public.vtuber_recommendations (vtuber_id, user_id)
    where user_id is not null;

-- ============================================================================
-- Rollback(僅在表內無 NULL user_id 列時可執行)
-- ============================================================================
-- drop index if exists public.vtuber_recommendations_vtuber_user_uniq;
-- alter table public.vtuber_recommendations
--     add constraint vtuber_recommendations_vtuber_id_user_id_key unique (vtuber_id, user_id);
-- alter table public.vtuber_recommendations
--     alter column user_id set not null;
