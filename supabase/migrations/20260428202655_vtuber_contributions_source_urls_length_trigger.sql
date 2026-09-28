-- 補強 vtuber_contributions.source_urls 單筆 URL 長度限制
-- Postgres CHECK 不支援 subquery，所以用 trigger 強制
-- 上限 2048 字（與 user_favorites.url 一致）

CREATE OR REPLACE FUNCTION public.validate_vtuber_contribution_source_urls()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    u text;
BEGIN
    IF NEW.source_urls IS NOT NULL THEN
        FOREACH u IN ARRAY NEW.source_urls LOOP
            IF char_length(u) > 2048 THEN
                RAISE EXCEPTION 'source_urls entry too long (% chars, max 2048)', char_length(u)
                  USING ERRCODE = '22023';
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_source_urls_trigger ON public.vtuber_contributions;
CREATE TRIGGER validate_source_urls_trigger
    BEFORE INSERT OR UPDATE OF source_urls ON public.vtuber_contributions
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_vtuber_contribution_source_urls();
