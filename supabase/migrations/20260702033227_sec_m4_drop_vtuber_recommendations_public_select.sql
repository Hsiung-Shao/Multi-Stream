-- M-4: 移除 vtuber_recommendations 的公開 SELECT,擋匿名讀 anonymous_id 關聯
-- 前端零引用;未來若需公開展示,另建只回彙總計數的 view
DROP POLICY IF EXISTS vtuber_recommendations_public_select ON public.vtuber_recommendations;
