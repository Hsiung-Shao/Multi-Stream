-- 補 CHECK constraints 防止 vtuber_contributions 被塞超大資料
-- Function 內已做主要驗證，這是 defense-in-depth 第二道牆
-- 注意：Postgres CHECK 不支援 subquery，所以單筆 URL 長度檢查交給 Function 端

DO $$
BEGIN
    -- source_urls 最多 5 筆
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vtuber_contributions_source_urls_count_check'
    ) THEN
        ALTER TABLE public.vtuber_contributions
        ADD CONSTRAINT vtuber_contributions_source_urls_count_check
        CHECK (array_length(source_urls, 1) IS NULL OR array_length(source_urls, 1) <= 5);
    END IF;

    -- source_note 最多 500 字
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vtuber_contributions_source_note_check'
    ) THEN
        ALTER TABLE public.vtuber_contributions
        ADD CONSTRAINT vtuber_contributions_source_note_check
        CHECK (source_note IS NULL OR char_length(source_note) <= 500);
    END IF;

    -- submitted_by 最多 200 字
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vtuber_contributions_submitted_by_check'
    ) THEN
        ALTER TABLE public.vtuber_contributions
        ADD CONSTRAINT vtuber_contributions_submitted_by_check
        CHECK (submitted_by IS NULL OR char_length(submitted_by) <= 200);
    END IF;

    -- submitter_contact 最多 200 字
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vtuber_contributions_submitter_contact_check'
    ) THEN
        ALTER TABLE public.vtuber_contributions
        ADD CONSTRAINT vtuber_contributions_submitter_contact_check
        CHECK (submitter_contact IS NULL OR char_length(submitter_contact) <= 200);
    END IF;

    -- payload 最大 16KB（jsonb）
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vtuber_contributions_payload_size_check'
    ) THEN
        ALTER TABLE public.vtuber_contributions
        ADD CONSTRAINT vtuber_contributions_payload_size_check
        CHECK (octet_length(payload::text) <= 16384);
    END IF;
END $$;

-- vtuber_events 也補幾個基本長度限制
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vtuber_events_title_check'
    ) THEN
        ALTER TABLE public.vtuber_events
        ADD CONSTRAINT vtuber_events_title_check
        CHECK (char_length(title) <= 200);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vtuber_events_description_check'
    ) THEN
        ALTER TABLE public.vtuber_events
        ADD CONSTRAINT vtuber_events_description_check
        CHECK (description IS NULL OR char_length(description) <= 2000);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vtuber_events_location_check'
    ) THEN
        ALTER TABLE public.vtuber_events
        ADD CONSTRAINT vtuber_events_location_check
        CHECK (location IS NULL OR char_length(location) <= 200);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vtuber_events_url_check'
    ) THEN
        ALTER TABLE public.vtuber_events
        ADD CONSTRAINT vtuber_events_url_check
        CHECK (url IS NULL OR char_length(url) <= 2048);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vtuber_events_image_url_check'
    ) THEN
        ALTER TABLE public.vtuber_events
        ADD CONSTRAINT vtuber_events_image_url_check
        CHECK (image_url IS NULL OR char_length(image_url) <= 2048);
    END IF;
END $$;
