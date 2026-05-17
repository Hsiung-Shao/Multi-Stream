-- 對齊 RPC `increment_contribution_quota` 的 type 白名單,加 4 種新 contribution_type
--
-- 背景:2026-05-17 推薦功能 V1 加了 4 種新 quota type:
--   recommend / recommend_comment / category_propose / category_tag
--
-- 我之前 commit 1.5 (extend_contribution_quota_types) 只 update 了 RPC 內
-- `IF p_type NOT IN (...)` 白名單,**忘了更新 contribution_rate_limits table
-- 自己的 CHECK constraint** ── table 級 CHECK 仍只允許 ('vtuber', 'event')。
--
-- 結果:
--   1. RPC 接受 'recommend' 進去
--   2. INSERT 試寫 contribution_type='recommend'
--   3. CHECK constraint 拒絕 → 23514 violates check
--   4. RPC throw exception → endpoint catch 視為 quota fail
--   5. user 看到 429 quota_exceeded(實際根本沒撞 quota)
--
-- 修法:DROP + 重 ADD CHECK constraint 包含全部 6 種 type
--
-- Rollback:把 type list 改回 ('vtuber', 'event') 即可,但要先確認沒
-- 既存 rows 用新 type(否則 ADD CONSTRAINT 會失敗)。

ALTER TABLE public.contribution_rate_limits
    DROP CONSTRAINT IF EXISTS contribution_rate_limits_contribution_type_check;

ALTER TABLE public.contribution_rate_limits
    ADD CONSTRAINT contribution_rate_limits_contribution_type_check
    CHECK (contribution_type IN (
        'vtuber',
        'event',
        'recommend',
        'recommend_comment',
        'category_propose',
        'category_tag'
    ));
