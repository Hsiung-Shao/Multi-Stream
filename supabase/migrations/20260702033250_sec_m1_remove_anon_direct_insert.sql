-- M-1: 移除 anon 直連 INSERT policy,強制寫入走後端 Function(service_role 繞 RLS 不受影響)
-- 前端已確認走 /api/feedback/submit 與 /api/announcements/respond,無 anon 直連 INSERT
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.feedbacks;
DROP POLICY IF EXISTS announcement_responses_public_insert ON public.announcement_responses;

-- belt-and-suspenders: 長度上限 CHECK(NOT VALID 不校驗既有資料,只約束新寫入)
ALTER TABLE public.feedbacks
  ADD CONSTRAINT feedbacks_content_len CHECK (char_length(content) <= 5000) NOT VALID;
ALTER TABLE public.announcement_responses
  ADD CONSTRAINT ar_text_response_len CHECK (text_response IS NULL OR char_length(text_response) <= 2000) NOT VALID;
