-- PR 7 2FA TOTP — 備援碼儲存表
--
-- 啟用方式：使用者在 Supabase Dashboard → SQL Editor 執行此檔，或用 MCP apply_migration
--
-- 為什麼獨立 table 而非加在 user_profiles：
--   user_profiles RLS 是 SELECT=true（公開），把 backup code hash 放那會被任何人讀到。
--   此表 RLS 不開任何 policy → anon / authenticated 都讀不到，僅 service_role
--   (Cloudflare Function) 可操作（service_role 預設 BYPASSRLS）。
--
-- TOTP secret 由 Supabase Auth 內部管理 (auth.mfa_factors)，本 table 只存自訂備援碼。

CREATE TABLE IF NOT EXISTS public.user_mfa_secrets (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    backup_codes_hashed jsonb NOT NULL DEFAULT '[]'::jsonb,
    enrolled_at timestamptz,
    recovered_at timestamptz,
    recovered_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_mfa_secrets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_mfa_secrets IS 'PR 7 2FA: backup codes 雜湊、enrolled 時間、recovery 統計。僅 service_role (Function) 可存取';
COMMENT ON COLUMN public.user_mfa_secrets.backup_codes_hashed IS 'JSON array of SHA-256 hex hashes (one per unused backup code). Code consumed = removed from array.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.user_mfa_secrets_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_mfa_secrets_touch ON public.user_mfa_secrets;
CREATE TRIGGER trg_user_mfa_secrets_touch
BEFORE UPDATE ON public.user_mfa_secrets
FOR EACH ROW EXECUTE FUNCTION public.user_mfa_secrets_touch_updated_at();

-- 不寫 USER-facing policy，等於：
--   - anon / authenticated → 讀不到、寫不了
--   - service_role → 預設 BYPASSRLS，可正常存取

-- 驗證
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='user_mfa_secrets';
