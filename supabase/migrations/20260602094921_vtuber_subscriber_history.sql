CREATE TABLE IF NOT EXISTS public.vtuber_subscriber_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vtuber_id uuid NOT NULL REFERENCES public.vtubers(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('twitch', 'youtube')),
    subscriber_count integer NOT NULL CHECK (subscriber_count >= 0),
    recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vtuber_subscriber_history_lookup_idx
    ON public.vtuber_subscriber_history (vtuber_id, platform, recorded_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS vtuber_subscriber_history_daily_uq
    ON public.vtuber_subscriber_history (vtuber_id, platform, ((recorded_at AT TIME ZONE 'UTC')::date));

ALTER TABLE public.vtuber_subscriber_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vtuber_subscriber_history_public_select ON public.vtuber_subscriber_history;
CREATE POLICY vtuber_subscriber_history_public_select
    ON public.vtuber_subscriber_history
    FOR SELECT
    TO public
    USING (true);
