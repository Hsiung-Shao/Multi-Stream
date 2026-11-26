-- 修正：已登入使用者可經 PostgREST 把自己的 user_profiles.trust_level 改成 'admin'（is_admin() 讀的就是它），
-- 取得 DB 端管理員權限。原 policy（user_profiles_insert／user_profiles_update_own）只綁「自己那一列」，不限欄位；
-- 欄位層 REVOKE 在表層已有 UPDATE 權限時無效，所以用 trigger 在 anon／authenticated 請求時鎖住權限欄位：
--   INSERT：trust_level、post_count、report_count 一律用預設值
--   UPDATE：保留原值
-- 沒有 JWT（SQL editor 的 postgres）或 service_role 的請求不受影響（後台設定管理員照常）。
--
-- 回滾：DROP TRIGGER IF EXISTS user_profiles_protect_privileged ON public.user_profiles;
--       DROP FUNCTION IF EXISTS public.user_profiles_protect_privileged();

CREATE OR REPLACE FUNCTION public.user_profiles_protect_privileged()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF coalesce(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        NEW.trust_level := 'new';
        NEW.post_count := 0;
        NEW.report_count := 0;
    ELSE
        NEW.trust_level := OLD.trust_level;
        NEW.post_count := OLD.post_count;
        NEW.report_count := OLD.report_count;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.user_profiles_protect_privileged() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_profiles_protect_privileged ON public.user_profiles;
CREATE TRIGGER user_profiles_protect_privileged
    BEFORE INSERT OR UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.user_profiles_protect_privileged();
