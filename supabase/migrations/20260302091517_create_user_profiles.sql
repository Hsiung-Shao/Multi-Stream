
-- ============================================
-- user_profiles 表：用戶個人資料（OAuth 綁定）
-- ============================================
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_auth_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Twitch OAuth
  twitch_id text UNIQUE,
  twitch_login text,
  twitch_display_name text,
  twitch_avatar_url text,
  twitch_created_at timestamptz,
  -- Google OAuth
  google_id text UNIQUE,
  google_display_name text,
  google_avatar_url text,
  -- Discord OAuth
  discord_id text UNIQUE,
  discord_username text,
  discord_avatar_url text,
  -- 顯示資訊
  display_name text NOT NULL,
  avatar_url text,
  -- 信任與管理
  trust_level text NOT NULL DEFAULT 'new'
    CHECK (trust_level IN ('new', 'trusted', 'moderator', 'admin', 'banned')),
  post_count int NOT NULL DEFAULT 0,
  report_count int NOT NULL DEFAULT 0,
  -- 時間戳
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX idx_user_profiles_supabase_auth_id ON user_profiles(supabase_auth_id);
CREATE INDEX idx_user_profiles_trust_level ON user_profiles(trust_level);

-- 啟用 RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS 政策：所有人可讀公開資訊
CREATE POLICY "user_profiles_select"
  ON user_profiles FOR SELECT
  TO public
  USING (true);

-- RLS 政策：本人可更新自己的資料（但不能改 trust_level）
CREATE POLICY "user_profiles_update_own"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (supabase_auth_id = auth.uid())
  WITH CHECK (supabase_auth_id = auth.uid());

-- RLS 政策：認證用戶可新增（註冊時）
CREATE POLICY "user_profiles_insert"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (supabase_auth_id = auth.uid());

-- ============================================
-- is_admin() 輔助函數：判斷當前用戶是否為管理員
-- 透過 user_profiles.trust_level 判斷
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE supabase_auth_id = auth.uid()
      AND trust_level = 'admin'
  );
$$;
