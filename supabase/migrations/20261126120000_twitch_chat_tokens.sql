-- 合併聊天室發言用的 Twitch 授權續期權杖（每個帳號一列）。
-- 只給伺服器（service role）讀寫：RLS 開、不寫任何 policy，並收回 anon／authenticated 的表權限；
-- 權杖以 AES-GCM 加密後才存（金鑰在 Cloudflare 環境變數 TWITCH_TOKEN_ENC_KEY，不在資料庫）。
-- 帳號刪除時 ON DELETE CASCADE 一併刪除。
--
-- 回滾：DROP TABLE IF EXISTS public.twitch_chat_tokens;（只影響發言功能，使用者重新用 Twitch 登入即可重建）

CREATE TABLE IF NOT EXISTS public.twitch_chat_tokens (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    twitch_user_id text NOT NULL CHECK (twitch_user_id ~ '^[0-9]{1,20}$'),
    login text NOT NULL CHECK (login ~ '^[a-z0-9_]{1,25}$'),
    refresh_token_enc text NOT NULL CHECK (char_length(refresh_token_enc) BETWEEN 1 AND 2048),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.twitch_chat_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.twitch_chat_tokens FROM anon, authenticated;
