
-- ============================================
-- posts 表：連動活動與重要賽事貼文
-- ============================================
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  event_type text NOT NULL
    CHECK (event_type IN ('collab', 'tournament', 'special', 'other')),
  related_urls text[] NOT NULL DEFAULT '{}',
  related_vtuber_ids uuid[] NOT NULL DEFAULT '{}',
  -- 狀態
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden', 'deleted')),
  report_count int NOT NULL DEFAULT 0,
  -- 時間
  event_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_event_type ON posts(event_type);

-- 啟用 RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 所有人可讀已發布的貼文
CREATE POLICY "posts_select_published"
  ON posts FOR SELECT
  TO public
  USING (status = 'published');

-- 管理員可讀所有貼文（含隱藏/刪除）
CREATE POLICY "posts_admin_select_all"
  ON posts FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 作者可讀自己的所有貼文
CREATE POLICY "posts_author_select_own"
  ON posts FOR SELECT
  TO authenticated
  USING (author_id IN (
    SELECT id FROM user_profiles WHERE supabase_auth_id = auth.uid()
  ));

-- 認證用戶可新增貼文（非 banned）
CREATE POLICY "posts_insert"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id IN (
      SELECT id FROM user_profiles
      WHERE supabase_auth_id = auth.uid()
        AND trust_level != 'banned'
    )
  );

-- 作者可更新自己的貼文（僅 title, content, event_type, related_urls, related_vtuber_ids, event_date, updated_at）
CREATE POLICY "posts_author_update_own"
  ON posts FOR UPDATE
  TO authenticated
  USING (author_id IN (
    SELECT id FROM user_profiles WHERE supabase_auth_id = auth.uid()
  ))
  WITH CHECK (author_id IN (
    SELECT id FROM user_profiles WHERE supabase_auth_id = auth.uid()
  ));

-- 管理員可更新所有貼文（隱藏/刪除等）
CREATE POLICY "posts_admin_update"
  ON posts FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 管理員可刪除貼文
CREATE POLICY "posts_admin_delete"
  ON posts FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================
-- post_reports 表：貼文檢舉
-- ============================================
CREATE TABLE post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  reason text NOT NULL
    CHECK (reason IN ('spam', 'offensive', 'irrelevant', 'other')),
  detail text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 每人對同篇只能檢舉一次
  UNIQUE(post_id, reporter_id)
);

-- 索引
CREATE INDEX idx_post_reports_post_id ON post_reports(post_id);
CREATE INDEX idx_post_reports_status ON post_reports(status);

-- 啟用 RLS
ALTER TABLE post_reports ENABLE ROW LEVEL SECURITY;

-- 認證用戶可新增檢舉（非 banned）
CREATE POLICY "post_reports_insert"
  ON post_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    reporter_id IN (
      SELECT id FROM user_profiles
      WHERE supabase_auth_id = auth.uid()
        AND trust_level != 'banned'
    )
  );

-- 管理員可讀所有檢舉
CREATE POLICY "post_reports_admin_select"
  ON post_reports FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 管理員可更新檢舉狀態
CREATE POLICY "post_reports_admin_update"
  ON post_reports FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================
-- 觸發器：檢舉時自動更新 posts.report_count
-- ============================================
CREATE OR REPLACE FUNCTION public.increment_post_report_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE posts SET report_count = report_count + 1 WHERE id = NEW.post_id;
  -- 自動隱藏：當檢舉數超過 5 則隱藏
  UPDATE posts SET status = 'hidden'
    WHERE id = NEW.post_id AND report_count >= 5 AND status = 'published';
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_post_report_insert
  AFTER INSERT ON post_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_post_report_count();
