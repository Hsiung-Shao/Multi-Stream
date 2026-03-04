-- VTuber Events Table
-- 用於儲存 VTuber 活動、直播排程、社群活動
-- 需在 Supabase Dashboard > SQL Editor 中手動執行

CREATE TABLE IF NOT EXISTS public.vtuber_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('vtuber_event', 'livestream', 'community')),
  vtuber_id UUID REFERENCES public.vtubers(id) ON DELETE SET NULL,
  organizer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location TEXT,
  url TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vtuber_events ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can read approved events"
  ON public.vtuber_events FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Authenticated users can insert"
  ON public.vtuber_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Owners can update own events"
  ON public.vtuber_events FOR UPDATE
  TO authenticated
  USING (auth.uid() = organizer_id);

CREATE POLICY "Admins full access"
  ON public.vtuber_events FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND trust_level IN ('admin', 'moderator')
    )
  );

-- Indexes
CREATE INDEX idx_vtuber_events_type ON public.vtuber_events(event_type);
CREATE INDEX idx_vtuber_events_start ON public.vtuber_events(start_time);
CREATE INDEX idx_vtuber_events_status ON public.vtuber_events(status);
CREATE INDEX idx_vtuber_events_organizer ON public.vtuber_events(organizer_id);
