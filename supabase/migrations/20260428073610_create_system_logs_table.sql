-- 通用 system log table，給 Cloudflare Functions 寫入運行時事件
-- 取代 console.warn/error，方便事後追查
-- 寫入只走 service_role；讀取限 admin

CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  source text NOT NULL CHECK (char_length(source) <= 100),     -- 例：'review-contribution' / 'rate-limit'
  message text NOT NULL CHECK (char_length(message) <= 1000),
  metadata jsonb,                                                -- 錯誤詳情、context
  request_ip text CHECK (request_ip IS NULL OR char_length(request_ip) <= 64),
  user_id uuid,                                                  -- 可選，能對到 auth.users.id
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- 只有 admin 能讀
CREATE POLICY "system_logs_admin_select"
  ON public.system_logs FOR SELECT
  USING (is_admin());

-- 不開 INSERT/UPDATE/DELETE policy → 必須走 service_role

-- 索引：常按 level/source/時間查
CREATE INDEX IF NOT EXISTS idx_system_logs_level_time ON public.system_logs(level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_source_time ON public.system_logs(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_user ON public.system_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- 自動清理：保留 90 天（用 pg_cron 設更佳，先用 partial index 避免膨脹）
-- 之後可加 scheduled job DELETE FROM system_logs WHERE created_at < now() - interval '90 days';
