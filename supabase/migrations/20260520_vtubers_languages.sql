-- 實況主語言屬性 — vtubers.languages text[]
--
-- Context:
--   Phase B(實況主語言屬性 + i18n 過濾):為了跨語言族群的推薦過濾,vtubers 需要
--   標記其主要使用語言。推薦時 user 勾選實況主語言,server union 進此欄位累積。
--   Locale token 對齊專案 i18n SUPPORTED_LANGS(src/lib/i18nRouting.ts):
--     'zh-TW', 'zh-CN', 'en', 'ja', 'ko'
--   (en/ja/ko 不帶 region 後綴,跟 i18n 路徑與 hreflang 一致;避免 mapping)
--
-- 變更:
--   1. 新增 languages text[] NOT NULL DEFAULT '{}'
--      → 既有 96 個 vtubers row 自動填空陣列,不影響歷史資料
--   2. CHECK constraint:
--      - languages 必須是 5 個合法 locale 的子集(<@ 子集運算子)
--      - array_length 上限 5(防 spam)
--   3. GIN index for languages @> array['xx'] / && 過濾查詢
--   4. column comment 紀錄用途
--
-- 後續:
--   - POST /api/recommendations body 接 languages,server union 寫入
--   - GET ?lang=xx filter(下一 phase)
--   - RecommendDialog 加多選 UI(本 phase)
--
-- RLS 不動。

alter table public.vtubers
    add column if not exists languages text[] not null default '{}';

alter table public.vtubers
    add constraint vtubers_languages_check
    check (
        languages <@ array['zh-TW','zh-CN','en','ja','ko']::text[]
        and array_length(languages, 1) <= 5
    );

create index if not exists vtubers_languages_gin
    on public.vtubers using gin (languages);

comment on column public.vtubers.languages is
    '實況主主要使用語言(對齊 i18n locale:zh-TW/zh-CN/en/ja/ko)。由推薦流程 union 累積;空陣列表示尚未標記。';

-- ============================================================================
-- 驗證(apply 後手動跑)
-- ============================================================================
-- SELECT data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='vtubers' AND column_name='languages';
-- → 'ARRAY'
--
-- SELECT indexname FROM pg_indexes WHERE indexname='vtubers_languages_gin'; → 1 row
-- SELECT conname FROM pg_constraint WHERE conname='vtubers_languages_check'; → 1 row

-- ============================================================================
-- Rollback
-- ============================================================================
-- drop index if exists public.vtubers_languages_gin;
-- alter table public.vtubers drop constraint if exists vtubers_languages_check;
-- alter table public.vtubers drop column if exists languages;
