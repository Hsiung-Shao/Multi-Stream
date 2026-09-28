
ALTER TABLE public.vtuber_recommendations
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.vtuber_recommendations
  DROP CONSTRAINT IF EXISTS vtuber_recommendations_vtuber_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS vtuber_recommendations_vtuber_user_uniq
  ON public.vtuber_recommendations (vtuber_id, user_id)
  WHERE user_id IS NOT NULL;
