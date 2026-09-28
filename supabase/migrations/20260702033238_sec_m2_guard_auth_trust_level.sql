-- M-2: auth_trust_level 加「僅本人或 admin」守衛,擋匿名經 RPC 枚舉他人權限等級
-- RLS policy 都以 auth.uid() 呼叫 → 自身 → 行為不變
-- RPC 傳他人 uid 且非 admin → 回 'new',無效化枚舉
CREATE OR REPLACE FUNCTION public.auth_trust_level(uid uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT trust_level FROM public.user_profiles
       WHERE supabase_auth_id = uid
         AND (uid = auth.uid() OR is_admin())
       LIMIT 1),
    'new'
  );
$function$;
