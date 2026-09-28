-- Sprint 1 Foundation Migration
-- Idempotent: uses CREATE OR REPLACE, IF NOT EXISTS, DROP IF EXISTS throughout.

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.auth_trust_level(uid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT trust_level FROM public.user_profiles WHERE supabase_auth_id = uid LIMIT 1),
        'new'
    );
$$;

REVOKE ALL ON FUNCTION public.auth_trust_level(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_trust_level(UUID) TO authenticated, service_role;

-- 1. user_favorite_categories
CREATE TABLE IF NOT EXISTS public.user_favorite_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 128),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, client_id),
    UNIQUE (user_id, name)
);
ALTER TABLE public.user_favorite_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner can read own categories" ON public.user_favorite_categories;
CREATE POLICY "Owner can read own categories" ON public.user_favorite_categories FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner can insert own categories" ON public.user_favorite_categories;
CREATE POLICY "Owner can insert own categories" ON public.user_favorite_categories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner can update own categories" ON public.user_favorite_categories;
CREATE POLICY "Owner can update own categories" ON public.user_favorite_categories FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner can delete own categories" ON public.user_favorite_categories;
CREATE POLICY "Owner can delete own categories" ON public.user_favorite_categories FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_touch_user_favorite_categories ON public.user_favorite_categories;
CREATE TRIGGER trg_touch_user_favorite_categories BEFORE UPDATE ON public.user_favorite_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_user_favorite_categories_user ON public.user_favorite_categories(user_id);

-- 2. user_favorite_tags
CREATE TABLE IF NOT EXISTS public.user_favorite_tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 128),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    color TEXT NOT NULL CHECK (char_length(color) BETWEEN 1 AND 32),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0 AND sort_order < 10000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, client_id)
);
ALTER TABLE public.user_favorite_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner can read own tags" ON public.user_favorite_tags;
CREATE POLICY "Owner can read own tags" ON public.user_favorite_tags FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner can insert own tags" ON public.user_favorite_tags;
CREATE POLICY "Owner can insert own tags" ON public.user_favorite_tags FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner can update own tags" ON public.user_favorite_tags;
CREATE POLICY "Owner can update own tags" ON public.user_favorite_tags FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner can delete own tags" ON public.user_favorite_tags;
CREATE POLICY "Owner can delete own tags" ON public.user_favorite_tags FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_touch_user_favorite_tags ON public.user_favorite_tags;
CREATE TRIGGER trg_touch_user_favorite_tags BEFORE UPDATE ON public.user_favorite_tags FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_user_favorite_tags_user ON public.user_favorite_tags(user_id);

-- 3. user_favorites
CREATE TABLE IF NOT EXISTS public.user_favorites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 128),
    url TEXT NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2048),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
    platform TEXT NOT NULL CHECK (platform IN ('twitch', 'youtube', 'other')),
    channel_id TEXT CHECK (channel_id IS NULL OR char_length(channel_id) <= 128),
    video_id TEXT CHECK (video_id IS NULL OR char_length(video_id) <= 128),
    category_client_id TEXT CHECK (category_client_id IS NULL OR char_length(category_client_id) <= 128),
    tag_client_ids TEXT[] NOT NULL DEFAULT '{}'
        CHECK (array_length(tag_client_ids, 1) IS NULL OR array_length(tag_client_ids, 1) <= 50),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, client_id)
);
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner can read own favorites" ON public.user_favorites;
CREATE POLICY "Owner can read own favorites" ON public.user_favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner can insert own favorites" ON public.user_favorites;
CREATE POLICY "Owner can insert own favorites" ON public.user_favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner can update own favorites" ON public.user_favorites;
CREATE POLICY "Owner can update own favorites" ON public.user_favorites FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owner can delete own favorites" ON public.user_favorites;
CREATE POLICY "Owner can delete own favorites" ON public.user_favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_touch_user_favorites ON public.user_favorites;
CREATE TRIGGER trg_touch_user_favorites BEFORE UPDATE ON public.user_favorites FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON public.user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_platform ON public.user_favorites(user_id, platform);

-- 4. contribution_rate_limits
CREATE TABLE IF NOT EXISTS public.contribution_rate_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contribution_type TEXT NOT NULL CHECK (contribution_type IN ('vtuber', 'event')),
    day_bucket DATE NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, contribution_type, day_bucket)
);
ALTER TABLE public.contribution_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_contribution_rate_limits_user_day ON public.contribution_rate_limits(user_id, day_bucket);

-- 5. vtuber_livestreams RLS (skip if table missing)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vtuber_livestreams') THEN
        EXECUTE 'ALTER TABLE public.vtuber_livestreams ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Anyone can read livestreams" ON public.vtuber_livestreams';
        EXECUTE 'CREATE POLICY "Anyone can read livestreams" ON public.vtuber_livestreams FOR SELECT USING (true)';
        EXECUTE 'DROP POLICY IF EXISTS "Admins can mutate livestreams" ON public.vtuber_livestreams';
        EXECUTE 'CREATE POLICY "Admins can mutate livestreams" ON public.vtuber_livestreams FOR ALL TO authenticated USING (public.auth_trust_level(auth.uid()) IN (''admin'', ''moderator'')) WITH CHECK (public.auth_trust_level(auth.uid()) IN (''admin'', ''moderator''))';
    END IF;
END $$;

-- 6. Lock down direct INSERT on vtuber_contributions
DO $$
DECLARE pol_name TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vtuber_contributions') THEN
        FOR pol_name IN
            SELECT policyname FROM pg_policies
            WHERE schemaname='public' AND tablename='vtuber_contributions' AND (cmd='INSERT' OR cmd='ALL')
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.vtuber_contributions', pol_name);
        END LOOP;
        EXECUTE 'DROP POLICY IF EXISTS "Submitter can read own contributions" ON public.vtuber_contributions';
        EXECUTE 'CREATE POLICY "Submitter can read own contributions" ON public.vtuber_contributions FOR SELECT TO authenticated USING (submitted_by = auth.uid()::text OR public.auth_trust_level(auth.uid()) IN (''admin'', ''moderator''))';
        EXECUTE 'DROP POLICY IF EXISTS "Admins can update contributions" ON public.vtuber_contributions';
        EXECUTE 'CREATE POLICY "Admins can update contributions" ON public.vtuber_contributions FOR UPDATE TO authenticated USING (public.auth_trust_level(auth.uid()) IN (''admin'', ''moderator''))';
    END IF;
END $$;

-- 7. Lock down direct INSERT on vtuber_events
DO $$
DECLARE pol_name TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vtuber_events') THEN
        FOR pol_name IN
            SELECT policyname FROM pg_policies
            WHERE schemaname='public' AND tablename='vtuber_events' AND cmd='INSERT'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.vtuber_events', pol_name);
        END LOOP;
    END IF;
END $$;
