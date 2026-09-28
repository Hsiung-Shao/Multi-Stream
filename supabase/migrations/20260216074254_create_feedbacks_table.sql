
CREATE TABLE public.feedbacks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now() NOT NULL,

    -- Core Feedback (必填)
    feedback_type text NOT NULL CHECK (feedback_type IN ('bug', 'feature', 'ui', 'other')),
    content text NOT NULL,

    -- Basic Survey (選填)
    source text,
    usage_time text[],
    usage_duration text,
    rating smallint CHECK (rating BETWEEN 1 AND 5),

    -- Promotion (選填)
    nps_score smallint CHECK (nps_score BETWEEN 0 AND 10),

    -- System Info (自動捕獲)
    user_agent text,
    screen_resolution text,
    window_size text,
    theme text,
    app_version text
);

-- RLS: 僅允許匿名使用者 insert
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON public.feedbacks
    FOR INSERT TO anon
    WITH CHECK (true);
