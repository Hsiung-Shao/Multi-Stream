-- YouTube Channels RLS Hardening:移除 always-true INSERT/UPDATE policy,改為 service_role only
-- 完整背景與 rollback 說明請見 supabase/migrations/20260513_youtube_channels_rls_hardening.sql

-- Step A:DROP always-true INSERT policy
drop policy if exists "youtube_channels_insert" on public.youtube_channels;

-- Step B:DROP always-true UPDATE policy
drop policy if exists "youtube_channels_update" on public.youtube_channels;

-- 註:保留 youtube_channels_select(public read),不在本 migration 動。
