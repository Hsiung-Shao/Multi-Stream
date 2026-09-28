
-- Allow update on vtuber_contributions (needed for admin review actions)
CREATE POLICY "vtuber_contributions_update"
  ON vtuber_contributions FOR UPDATE
  USING (true)
  WITH CHECK (true);
