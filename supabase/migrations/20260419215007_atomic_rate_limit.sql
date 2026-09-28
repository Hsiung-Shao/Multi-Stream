CREATE OR REPLACE FUNCTION public.increment_contribution_quota(
    p_user_id UUID,
    p_type TEXT,
    p_quota INTEGER
)
RETURNS TABLE (allowed BOOLEAN, new_count INTEGER, quota_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_day DATE := (now() AT TIME ZONE 'UTC')::DATE;
    v_count INTEGER;
BEGIN
    IF p_type NOT IN ('vtuber', 'event') THEN
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
$$;

REVOKE ALL ON FUNCTION public.increment_contribution_quota(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_contribution_quota(UUID, TEXT, INTEGER) TO service_role;
