
-- ============================================
-- 修正現有表的 RLS 政策
-- 原則：讀取開放，寫入限管理員
-- 注意：不動 Umami 表（user, session, website 等）
-- ============================================

-- ==================
-- vtubers 表：移除過於寬鬆的寫入政策
-- ==================
DROP POLICY IF EXISTS "vtubers_insert" ON vtubers;
DROP POLICY IF EXISTS "vtubers_update" ON vtubers;
DROP POLICY IF EXISTS "vtubers_delete" ON vtubers;
-- SELECT 保留

-- 僅管理員可寫入
CREATE POLICY "vtubers_admin_insert"
  ON vtubers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "vtubers_admin_update"
  ON vtubers FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "vtubers_admin_delete"
  ON vtubers FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==================
-- vtuber_groups 表：移除過於寬鬆的寫入政策
-- ==================
DROP POLICY IF EXISTS "vtuber_groups_insert" ON vtuber_groups;

-- 僅管理員可寫入
CREATE POLICY "vtuber_groups_admin_insert"
  ON vtuber_groups FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "vtuber_groups_admin_update"
  ON vtuber_groups FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "vtuber_groups_admin_delete"
  ON vtuber_groups FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==================
-- vtuber_contributions 表：收緊 UPDATE 權限
-- ==================
DROP POLICY IF EXISTS "vtuber_contributions_update" ON vtuber_contributions;

-- 僅管理員可更新（審核 status）
CREATE POLICY "vtuber_contributions_admin_update"
  ON vtuber_contributions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ==================
-- vtuber_livestreams 表：加入寫入限制
-- ==================
CREATE POLICY "vtuber_livestreams_admin_insert"
  ON vtuber_livestreams FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "vtuber_livestreams_admin_update"
  ON vtuber_livestreams FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "vtuber_livestreams_admin_delete"
  ON vtuber_livestreams FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==================
-- feedbacks 表：保留匿名新增，收緊管理為 admin only
-- ==================
DROP POLICY IF EXISTS "Authenticated users can select" ON feedbacks;
DROP POLICY IF EXISTS "Authenticated users can update" ON feedbacks;
DROP POLICY IF EXISTS "Authenticated users can delete" ON feedbacks;

-- 僅管理員可讀取/修改回饋
CREATE POLICY "feedbacks_admin_select"
  ON feedbacks FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "feedbacks_admin_update"
  ON feedbacks FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "feedbacks_admin_delete"
  ON feedbacks FOR DELETE
  TO authenticated
  USING (public.is_admin());
