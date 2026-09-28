-- 新增管理欄位
ALTER TABLE public.feedbacks
    ADD COLUMN status text DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'processed', 'archived')),
    ADD COLUMN admin_notes text;

-- RLS: 已認證使用者可以讀取所有 feedback
CREATE POLICY "Authenticated users can select" ON public.feedbacks
    FOR SELECT TO authenticated
    USING (true);

-- RLS: 已認證使用者可以更新 feedback
CREATE POLICY "Authenticated users can update" ON public.feedbacks
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- RLS: 已認證使用者可以刪除 feedback
CREATE POLICY "Authenticated users can delete" ON public.feedbacks
    FOR DELETE TO authenticated
    USING (true);
