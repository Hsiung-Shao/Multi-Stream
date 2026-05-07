-- PR 7 fix：改 totp-status 從 GoTrue admin REST 改走 RPC
--
-- 為什麼：/auth/v1/admin/users/{id}/factors 在 GoTrue 不是穩定的公開 API，回應結構
-- 不一致（不同 Supabase 版本回 { factors: [...] } 或 [...] 或 null），Function 端
-- 解析經常拿不到 verified factor → totp-status 永遠回 enrolled: false。
--
-- 改用 SECURITY DEFINER RPC 直接查 auth.mfa_factors，避開 GoTrue admin API instability。
--
-- 安全：function 只讀指定 user 的 totp factors id/status/created_at，
-- **不洩漏 secret/encrypted_data**；service_role only 呼叫（anon/authenticated revoke）。

CREATE OR REPLACE FUNCTION public.get_user_totp_factors(p_user_id uuid)
RETURNS TABLE(id uuid, status text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT id, status::text, created_at
    FROM auth.mfa_factors
    WHERE user_id = p_user_id AND factor_type = 'totp'
    ORDER BY created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_user_totp_factors(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_totp_factors(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_totp_factors(uuid) TO service_role;

COMMENT ON FUNCTION public.get_user_totp_factors(uuid) IS
'PR 7: service_role-only — 給 totp-status Function 查 user 的 TOTP factor 狀態，避開 GoTrue admin REST 的 instability';
