-- 匿名推薦去重 — 新增 anonymous_id + partial UNIQUE
--
-- Context:
--   20260517_recs_anon.sql 已開放 user_id 為 NULL 以支援匿名推薦,
--   但匿名推薦目前無任何去重機制(可同 IP/裝置無限重推同一 vtuber)。
--   為了在不要求登入的前提下,仍能擋掉「同一匿名 client 對同一 vtuber 多次推薦」,
--   引入 anonymous_id:browser 端生成 UUID 存 localStorage(key:
--   `recommendations:anonymous_id`),提交推薦時帶上來,server 寫入此欄。
--   清 localStorage 或換瀏覽器即可繞過 — 屬 UX 防呆而非強防護,符合
--   MVP「先把功能跑起來」精神;後續需強防護再加 IP hash / Turnstile。
--
-- 變更:
--   1. 新增 anonymous_id text 欄位(nullable,登入 user 該欄為 NULL)
--   2. 建 partial UNIQUE index,僅在 anonymous_id IS NOT NULL AND user_id IS NULL
--      時生效 → 同 anonymous_id 對同 vtuber 只能推一次;登入 user 走另一條
--      partial UNIQUE(vtuber_recommendations_vtuber_user_uniq)
--
-- 兩條 partial UNIQUE 的分工:
--   - vtuber_recommendations_vtuber_user_uniq        WHERE user_id IS NOT NULL
--     登入 user 的去重(已存在,來自 20260517_recs_anon.sql)
--   - vtuber_recommendations_vtuber_anon_uniq        WHERE anonymous_id IS NOT NULL AND user_id IS NULL
--     匿名 client 的去重(本 migration)
--
-- RLS 不動。三條 policy 維持原樣:
--   - public_select (USING true)
--   - self_insert (WITH CHECK user_id = auth.uid())
--   - self_delete (USING user_id = auth.uid())
-- 匿名 INSERT 由 endpoint 用 service_role 寫入,繞過 RLS;同時 endpoint
-- 負責填 anonymous_id 並對 conflict 做語意化錯誤回應。

alter table public.vtuber_recommendations
    add column if not exists anonymous_id text;

comment on column public.vtuber_recommendations.anonymous_id is
    '匿名推薦識別:browser 端生成 UUID 存 localStorage,提交時帶上,server 直接寫入(不做轉型/hash)。登入 user 該欄為 NULL,改用 user_id 去重。';

create unique index if not exists vtuber_recommendations_vtuber_anon_uniq
    on public.vtuber_recommendations (vtuber_id, anonymous_id)
    where anonymous_id is not null and user_id is null;

-- ============================================================================
-- 驗證(apply 後手動跑)
-- ============================================================================
-- SELECT column_name, is_nullable, data_type
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='vtuber_recommendations'
--   AND column_name='anonymous_id';
--
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE schemaname='public' AND indexname='vtuber_recommendations_vtuber_anon_uniq';
--
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname='public' AND tablename='vtuber_recommendations'
-- ORDER BY policyname;

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop index if exists public.vtuber_recommendations_vtuber_anon_uniq;
-- alter table public.vtuber_recommendations drop column if exists anonymous_id;
