-- 擴充 increment_contribution_quota 接受的 contribution_type
--
-- V1 推薦功能需要 4 種新 quota type,原 RPC 只允許 ('vtuber', 'event')。
-- 不放開全部 text 是為了 防 typo 寫錯 type 變成 silent free quota。
--
-- 新加 type:
--   recommend         daily 50  (推薦動作)
--   recommend_comment daily 30  (推薦時加留言)
--   category_propose  daily 3   (提分類)
--   category_tag      daily 50  (對 vtuber 打 approved category)
--
-- Rollback:把 IF 條件改回 ('vtuber', 'event') 即可。

CREATE OR REPLACE FUNCTION public.increment_contribution_quota(p_user_id uuid, p_type text, p_quota integer)
 RETURNS TABLE(allowed boolean, new_count integer, quota_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_day DATE := (now() AT TIME ZONE 'UTC')::DATE;
    v_count INTEGER;
BEGIN
    IF p_type NOT IN ('vtuber', 'event', 'recommend', 'recommend_comment', 'category_propose', 'category_tag') THEN
        RAISE EXCEPTION 'invalid contribution_type: %', p_type;
    END IF;

    IF p_quota = 0 THEN
        RETURN QUERY SELECT FALSE, 0, 0;
        RETURN;
    END IF;

    INSERT INTO public.contribution_rate_limits
        (user_id, contribution_type, day_bucket, count, last_at)
    VALUES (p_user_id, p_type, v_day, 1, now())
    ON CONFLICT (user_id, contribution_type, day_bucket)
    DO UPDATE SET
        count = public.contribution_rate_limits.count + 1,
        last_at = now()
    RETURNING count INTO v_count;

    IF p_quota < 0 THEN
        RETURN QUERY SELECT TRUE, v_count, -1;
    ELSIF v_count <= p_quota THEN
        RETURN QUERY SELECT TRUE, v_count, p_quota;
    ELSE
        UPDATE public.contribution_rate_limits
        SET count = count - 1
        WHERE user_id = p_user_id
          AND contribution_type = p_type
          AND day_bucket = v_day;
        RETURN QUERY SELECT FALSE, p_quota, p_quota;
    END IF;
END;
$function$;
