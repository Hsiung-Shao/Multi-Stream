-- 對齊 RPC 白名單,加 4 種新 contribution_type
-- 之前 commit 1.5 只 update RPC,漏改 table 自己的 CHECK constraint
-- 導致 INSERT 撞 constraint → RPC throw → endpoint 回 429

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
