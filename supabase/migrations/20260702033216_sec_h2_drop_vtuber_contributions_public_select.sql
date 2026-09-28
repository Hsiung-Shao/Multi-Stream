-- H-2: 移除 vtuber_contributions 的公開 SELECT,擋 submitter_contact / reviewer_notes 外洩
-- 保留 "Submitter can read own contributions"(本人 + admin/mod)
DROP POLICY IF EXISTS vtuber_contributions_select ON public.vtuber_contributions;
