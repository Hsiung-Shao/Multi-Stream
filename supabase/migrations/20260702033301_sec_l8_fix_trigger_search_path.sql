-- L-8: 固定 3 個 updated_at trigger 函式的 search_path(清 function_search_path_mutable advisor)
-- 函式 body 僅呼叫 now()(pg_catalog,永遠隱含可解析),設 '' 安全,不影響觸發器
ALTER FUNCTION public.handle_youtube_channels_updated_at() SET search_path = '';
ALTER FUNCTION public.touch_updated_at() SET search_path = '';
ALTER FUNCTION public.user_mfa_secrets_touch_updated_at() SET search_path = '';
