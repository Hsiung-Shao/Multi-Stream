
-- Enable pg_trgm for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- YouTube channel cache table
CREATE TABLE public.youtube_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id TEXT NOT NULL UNIQUE,
  channel_title TEXT NOT NULL,
  thumbnail_url TEXT,
  subscriber_count INTEGER,
  view_count BIGINT,
  video_count INTEGER,
  description TEXT,
  custom_url TEXT,
  published_at TIMESTAMPTZ,
  last_live_title TEXT,
  last_live_url TEXT,
  last_live_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for lookups
CREATE INDEX idx_youtube_channels_channel_id ON public.youtube_channels (channel_id);
CREATE INDEX idx_youtube_channels_channel_title ON public.youtube_channels USING gin (channel_title gin_trgm_ops);

-- Enable RLS
ALTER TABLE public.youtube_channels ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "youtube_channels_select" ON public.youtube_channels
  FOR SELECT USING (true);

-- Authenticated users can upsert
CREATE POLICY "youtube_channels_insert" ON public.youtube_channels
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "youtube_channels_update" ON public.youtube_channels
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_youtube_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_youtube_channels_updated_at
  BEFORE UPDATE ON public.youtube_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_youtube_channels_updated_at();
