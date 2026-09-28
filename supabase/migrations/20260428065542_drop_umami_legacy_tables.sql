-- Drop legacy Umami self-hosted analytics tables
-- 前端 Umami 連接已於 commit 67051c2 完整移除，這些 DB 表已不再被寫入
-- 共 14 個 table（Prisma-managed schema），含累積 ~28K rows tracking 資料
-- 移除依賴順序：子表先、父表後（CASCADE 保險）

-- Event/session 子表（FK to website/session）
DROP TABLE IF EXISTS public.event_data CASCADE;
DROP TABLE IF EXISTS public.session_data CASCADE;
DROP TABLE IF EXISTS public.website_event CASCADE;
DROP TABLE IF EXISTS public.revenue CASCADE;

-- Session/website 主表
DROP TABLE IF EXISTS public.session CASCADE;

-- Report / segment / link / pixel（皆 FK to website）
DROP TABLE IF EXISTS public.report CASCADE;
DROP TABLE IF EXISTS public.segment CASCADE;
DROP TABLE IF EXISTS public.link CASCADE;
DROP TABLE IF EXISTS public.pixel CASCADE;

-- Team
DROP TABLE IF EXISTS public.team_user CASCADE;
DROP TABLE IF EXISTS public.team CASCADE;

-- Website 主表（其他子表都已 drop）
DROP TABLE IF EXISTS public.website CASCADE;

-- Umami admin 帳號（注意是小寫 user，不是 user_profiles）
DROP TABLE IF EXISTS public."user" CASCADE;

-- Prisma migration 紀錄表（Umami 自己用的，與 Supabase migration 無關）
DROP TABLE IF EXISTS public._prisma_migrations CASCADE;
