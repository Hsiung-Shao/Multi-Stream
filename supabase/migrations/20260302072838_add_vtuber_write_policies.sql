
-- Allow insert/update/delete on vtubers (needed for applying approved contributions)
CREATE POLICY "vtubers_insert"
  ON vtubers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "vtubers_update"
  ON vtubers FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "vtubers_delete"
  ON vtubers FOR DELETE
  USING (true);

-- Allow insert on vtuber_groups (needed for resolving group_name → group_id)
CREATE POLICY "vtuber_groups_insert"
  ON vtuber_groups FOR INSERT
  WITH CHECK (true);
