
-- ============================================================
-- VTuber Tables for MultiStream Hub
-- ============================================================

-- 1. vtuber_groups
CREATE TABLE vtuber_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  nationality TEXT CHECK (nationality IN ('TW','HK','MY','JP','KR','OTHER')),
  member_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. vtubers
CREATE TABLE vtubers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  img_url TEXT,
  activity TEXT NOT NULL DEFAULT 'active' CHECK (activity IN ('active','graduate')),
  nationality TEXT NOT NULL CHECK (nationality IN ('TW','HK','MY','JP','KR','OTHER')),
  group_id UUID REFERENCES vtuber_groups(id) ON DELETE SET NULL,
  youtube_channel_id TEXT,
  youtube_subscriber_count INT,
  twitch_channel_id TEXT,
  twitch_follower_count INT,
  popular_video_type TEXT,
  popular_video_id TEXT,
  debut_date DATE,
  channel_id_verified BOOLEAN NOT NULL DEFAULT false,
  contributed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. vtuber_livestreams
CREATE TABLE vtuber_livestreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vtuber_id UUID NOT NULL REFERENCES vtubers(id) ON DELETE CASCADE,
  title TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('youtube','twitch')),
  start_time TIMESTAMPTZ,
  viewer_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. vtuber_contributions
CREATE TABLE vtuber_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN ('add','edit','delete')),
  target_vtuber_id UUID REFERENCES vtubers(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  submitted_by TEXT,
  submitter_contact TEXT,
  source_urls TEXT[] NOT NULL DEFAULT '{}',
  source_note TEXT,
  auto_check JSONB,
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_vtubers_nationality ON vtubers(nationality);
CREATE INDEX idx_vtubers_group_id ON vtubers(group_id);
CREATE INDEX idx_vtubers_activity ON vtubers(activity);
CREATE INDEX idx_vtubers_name ON vtubers(name);

CREATE INDEX idx_livestreams_vtuber_id ON vtuber_livestreams(vtuber_id);
CREATE INDEX idx_livestreams_platform ON vtuber_livestreams(platform);

CREATE INDEX idx_contributions_status ON vtuber_contributions(status);
CREATE INDEX idx_contributions_created_at ON vtuber_contributions(created_at DESC);

-- ============================================================
-- updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vtuber_groups_updated_at
  BEFORE UPDATE ON vtuber_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_vtubers_updated_at
  BEFORE UPDATE ON vtubers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
