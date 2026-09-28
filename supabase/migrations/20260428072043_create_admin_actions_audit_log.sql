-- Audit log for all admin moderation actions
-- 寫入由 Cloudflare Functions (review-*.js) 用 service_role 執行
-- SELECT 由 admin 透過 RLS（is_admin()）讀

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,           -- auth.users.id of the admin who performed
  action_type text NOT NULL CHECK (action_type IN (
    'review_vtuber_contribution',
    'review_vtuber_event',
    'ban_user',
    'other'
  )),
  target_id uuid,                        -- 被操作的紀錄 id（contribution / event 等）
  decision text CHECK (decision IS NULL OR decision IN ('approve', 'reject', 'ban', 'unban')),
  before_status text,
  after_status text,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  metadata jsonb,                        -- before-after diff 等彈性欄位
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- 只有 admin 能讀
CREATE POLICY "admin_actions_admin_select"
  ON public.admin_actions FOR SELECT
  USING (is_admin());

-- 不開 INSERT/UPDATE/DELETE policy → 必須走 service_role
-- （Cloudflare Function 已驗 admin 後才寫入）

-- 索引：常按 admin/時間/target 查詢
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON public.admin_actions(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON public.admin_actions(target_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_type_time ON public.admin_actions(action_type, created_at DESC);
