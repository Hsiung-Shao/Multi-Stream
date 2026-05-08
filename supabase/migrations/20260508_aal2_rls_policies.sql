-- 2FA 啟用後強制 aal2 才能 access user 隱私資料（DB 層防線）
--
-- 模式：依 Supabase MFA 文件「Enforce only for users that have opted-in」設計：
--   - 若 user 有 verified TOTP factor → 該 user 的 session 必須 aal2 才能 read/write
--   - 若 user 沒啟用 2FA → 不影響（aal1 + aal2 都允許）
--
-- 影響表：user_profiles / user_favorites / user_favorite_categories / user_favorite_tags
-- （user_mfa_secrets 已經是 service_role only，不需另加 policy；feedbacks 為 write-only
--  user 投稿不必 aal2）
--
-- 配合：
--   - client 端 src/hooks/useAuth.ts 加 mfaRequired state + AuthProvider 渲染 MfaLoginGate
--     強制走過 challenge dialog 才能升 aal2
--   - server endpoints (delete-account, update-display-name, totp-unenroll, totp-backup-codes)
--     獨立檢查 aal2
--
-- ⚠️ 部署順序重要：
--   此 migration **必須**在 client 新版（含 MfaLoginGate）已 deploy 到 production main
--   後才能 apply。否則 user 在舊 client 上登入時 aal1 token 會被 RLS 擋住所有 query，
--   而舊 client 沒有 mfaRequired flow 處理機制 → UI 崩壞。

-- ============================================================================
-- user_profiles
-- ============================================================================
create policy "user_profiles_aal2_when_mfa_enrolled" on public.user_profiles
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );

-- ============================================================================
-- user_favorites
-- ============================================================================
create policy "user_favorites_aal2_when_mfa_enrolled" on public.user_favorites
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );

-- ============================================================================
-- user_favorite_categories
-- ============================================================================
create policy "user_favorite_categories_aal2_when_mfa_enrolled" on public.user_favorite_categories
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );

-- ============================================================================
-- user_favorite_tags
-- ============================================================================
create policy "user_favorite_tags_aal2_when_mfa_enrolled" on public.user_favorite_tags
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );

-- ============================================================================
-- 撤銷指令（如需 rollback）
-- ============================================================================
-- drop policy if exists "user_profiles_aal2_when_mfa_enrolled" on public.user_profiles;
-- drop policy if exists "user_favorites_aal2_when_mfa_enrolled" on public.user_favorites;
-- drop policy if exists "user_favorite_categories_aal2_when_mfa_enrolled" on public.user_favorite_categories;
-- drop policy if exists "user_favorite_tags_aal2_when_mfa_enrolled" on public.user_favorite_tags;
