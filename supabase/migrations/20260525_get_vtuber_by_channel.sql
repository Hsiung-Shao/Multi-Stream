-- 用 (platform, channelId) 精確查 vtubers,給 RecommendDialog 判斷
-- 「主推頻道是否已在 db、是否已連結另一平台」用。
--
-- Twitch login 大小寫不敏感(parse 後雖 lowercased,但 db 既存資料未必),
-- 兩邊都 lower() 保險。YouTube UC ID 大小寫敏感,不轉。
--
-- 公開可查(anon + authenticated),純讀取 vtubers + 聚合 recommend_count。

CREATE OR REPLACE FUNCTION public.get_vtuber_by_channel(
  p_platform   text,
  p_channel_id text
)
RETURNS TABLE (
  id                  uuid,
  name                text,
  youtube_channel_id  text,
  twitch_channel_id   text,
  img_url             text,
  languages           text[],
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
    COALESCE(rc.cnt, 0)::bigint AS recommend_count
  FROM public.vtubers v
  LEFT JOIN (
    SELECT vtuber_id, COUNT(*) AS cnt
    FROM public.vtuber_recommendations
    GROUP BY vtuber_id
  ) rc ON rc.vtuber_id = v.id
  WHERE
    (p_platform = 'twitch'  AND lower(v.twitch_channel_id)  = lower(p_channel_id))
    OR
    (p_platform = 'youtube' AND v.youtube_channel_id = p_channel_id)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_vtuber_by_channel(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_vtuber_by_channel(text, text) IS
  '依 (platform, channel_id) 精確查 vtuber + 累積推薦數。RecommendDialog 用來判斷是否已連結另一平台。';
