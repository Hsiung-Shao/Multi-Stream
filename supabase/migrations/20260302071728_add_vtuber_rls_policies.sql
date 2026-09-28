
-- ============================================================
-- Enable RLS on all VTuber tables
-- ============================================================

ALTER TABLE vtuber_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE vtubers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vtuber_livestreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE vtuber_contributions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- vtuber_groups: public read-only
-- ============================================================

CREATE POLICY "vtuber_groups_select"
  ON vtuber_groups FOR SELECT
  USING (true);

-- ============================================================
-- vtubers: public read-only
-- ============================================================

CREATE POLICY "vtubers_select"
  ON vtubers FOR SELECT
  USING (true);

-- ============================================================
-- vtuber_livestreams: public read-only
-- ============================================================

CREATE POLICY "vtuber_livestreams_select"
  ON vtuber_livestreams FOR SELECT
  USING (true);

-- ============================================================
-- vtuber_contributions: public read + anon insert
-- ============================================================

CREATE POLICY "vtuber_contributions_select"
  ON vtuber_contributions FOR SELECT
  USING (true);

CREATE POLICY "vtuber_contributions_insert"
  ON vtuber_contributions FOR INSERT
  WITH CHECK (true);
