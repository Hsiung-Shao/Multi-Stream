-- Cascade delete user 在 public schema 的所有資料
-- 由 Cloudflare Function /api/account/delete-account 用 service_role 呼叫
-- auth.users 的刪除走 Supabase Admin API（這個 RPC 不處理）
-- admin_actions 不刪（audit log 保留）

CREATE OR REPLACE FUNCTION public.delete_user_cascade(p_auth_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id uuid;
    v_deleted jsonb := '{}'::jsonb;
    v_count integer;
BEGIN
    -- 取出 user_profiles.id（內部 PK，與 supabase_auth_id 不同）
    SELECT id INTO v_profile_id FROM public.user_profiles
    WHERE supabase_auth_id = p_auth_user_id LIMIT 1;

    -- 1. user_favorites（FK to user_profiles.id）
    IF v_profile_id IS NOT NULL THEN
        DELETE FROM public.user_favorites WHERE user_id = v_profile_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := v_deleted || jsonb_build_object('user_favorites', v_count);

        DELETE FROM public.user_favorite_categories WHERE user_id = v_profile_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := v_deleted || jsonb_build_object('user_favorite_categories', v_count);

        DELETE FROM public.user_favorite_tags WHERE user_id = v_profile_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := v_deleted || jsonb_build_object('user_favorite_tags', v_count);
    END IF;

    -- 2. vtuber_contributions（submitted_by 是 text，登入投稿存 auth user_id::text）
    DELETE FROM public.vtuber_contributions WHERE submitted_by = p_auth_user_id::text;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('vtuber_contributions', v_count);

    -- 3. vtuber_events（organizer_id 是 uuid，存 auth user_id）
    DELETE FROM public.vtuber_events WHERE organizer_id = p_auth_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('vtuber_events', v_count);

    -- 4. contribution_rate_limits
    DELETE FROM public.contribution_rate_limits WHERE user_id = p_auth_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('contribution_rate_limits', v_count);

    -- 5. posts / post_reports（如果有）— posts.author_id 是 user_profiles.id
    IF v_profile_id IS NOT NULL THEN
        DELETE FROM public.post_reports WHERE reporter_id = v_profile_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := v_deleted || jsonb_build_object('post_reports', v_count);

        DELETE FROM public.posts WHERE author_id = v_profile_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := v_deleted || jsonb_build_object('posts', v_count);
    END IF;

    -- 6. 最後刪 user_profiles
    IF v_profile_id IS NOT NULL THEN
        DELETE FROM public.user_profiles WHERE id = v_profile_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted := v_deleted || jsonb_build_object('user_profiles', v_count);
    END IF;

    RETURN v_deleted;
END;
$$;

-- 不開放給 anon/authenticated，只能 service_role 呼叫
REVOKE ALL ON FUNCTION public.delete_user_cascade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_cascade(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.delete_user_cascade(uuid) FROM anon;
