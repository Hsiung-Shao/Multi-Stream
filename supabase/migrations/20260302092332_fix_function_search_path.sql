
-- 修復 search_path 安全警告
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.increment_post_report_count() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
