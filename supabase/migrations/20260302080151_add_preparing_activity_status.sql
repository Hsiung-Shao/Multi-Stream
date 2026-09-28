ALTER TABLE vtubers DROP CONSTRAINT IF EXISTS vtubers_activity_check;
ALTER TABLE vtubers ADD CONSTRAINT vtubers_activity_check CHECK (activity = ANY (ARRAY['active'::text, 'graduate'::text, 'preparing'::text]));
