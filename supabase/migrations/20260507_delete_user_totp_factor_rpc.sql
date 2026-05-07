-- PR 7：給 totp-recover 用的 SECURITY DEFINER 刪 totp factor RPC
-- 避開不穩定的 GoTrue admin REST DELETE endpoint。
--
-- 安全：service_role only；只刪指定 (user_id, factor_id) 配對且 factor_type=totp。

CREATE OR REPLACE FUNCTION public.delete_user_totp_factor(p_user_id uuid, p_factor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    deleted_count int;
BEGIN
    DELETE FROM auth.mfa_factors
    WHERE id = p_factor_id
      AND user_id = p_user_id
      AND factor_type = 'totp';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_totp_factor(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_totp_factor(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_totp_factor(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.delete_user_totp_factor(uuid, uuid) IS
'PR 7: service_role only — 給 totp-recover 用，刪指定 user 的指定 totp factor，避開 GoTrue admin REST instability';
