-- 為 vtubers.name 加上 trigram GIN index,加速 /api/vtubers/search 的 pg_trgm
-- similarity() 比對(推薦 Dialog 的「您是不是這位?」功能)。
--
-- pg_trgm extension 已啟用(v1.6),這支:
--   1. 加 GIN index(name gin_trgm_ops)
--   2. 建 search_vtubers RPC,讓 /api/vtubers/search 走相似度排序

CREATE INDEX IF NOT EXISTS vtubers_name_trgm_idx
  ON public.vtubers
  USING gin (name gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────────────────
-- RPC:依 displayName 模糊比對既有 vtuber,回傳 top N 候選 + 累積推薦數
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_vtubers(
  q              text,
  lim            int  DEFAULT 5,
  min_similarity real DEFAULT 0.25
)
RETURNS TABLE (
  id                  uuid,
  name                text,
  youtube_channel_id  text,
  twitch_channel_id   text,
  img_url             text,
  languages           text[],
  score               real,
  recommend_count     bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id, v.name, v.youtube_channel_id, v.twitch_channel_id,
    v.img_url, v.languages,
    similarity(v.name, q)::real AS score,
    COALESCE(rc.cnt, 0)::bigint AS recommend_count
  FROM public.vtubers v
  LEFT JOIN (
    SELECT vtuber_id, COUNT(*) AS cnt
    FROM public.vtuber_recommendations
    GROUP BY vtuber_id
  ) rc ON rc.vtuber_id = v.id
  WHERE similarity(v.name, q) > GREATEST(min_similarity, 0)
  ORDER BY score DESC, recommend_count DESC
  LIMIT GREATEST(LEAST(lim, 20), 1);
$$;

GRANT EXECUTE ON FUNCTION public.search_vtubers(text, int, real) TO anon, authenticated;

COMMENT ON FUNCTION public.search_vtubers(text, int, real) IS
  '推薦 Dialog suggestion: 對 vtubers.name 跑 pg_trgm similarity,回傳 top N + 累積推薦數。匿名可呼叫。';

-- 驗證:
--   EXPLAIN ANALYZE SELECT * FROM search_vtubers('Pekora');
--   → 應走 Bitmap Index Scan on vtubers_name_trgm_idx
