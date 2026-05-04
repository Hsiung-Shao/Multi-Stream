import { FeedbackFormData } from './FeedbackTypes';

export interface FeedbackPayload extends FeedbackFormData {
    userAgent: string;
    screenResolution: string;
    windowSize: string;
    theme: string;
    version: string;
}

export const FeedbackService = {
    /**
     * 送意見回饋到 Cloudflare Function /api/feedback/submit
     * Function 用 service_role 寫入 feedbacks 表（繞過 RLS），含 IP rate limit
     * 與先前直連 supabase.from('feedbacks').insert() 不同
     */
    sendFeedback: async (data: FeedbackPayload): Promise<void> => {
        let session: { access_token?: string } | null = null;
        try {
            const { getSupabase } = await import('../../lib/supabase');
            const supabase = await getSupabase();
            if (supabase) {
                const { data: sd } = await supabase.auth.getSession();
                session = sd?.session ?? null;
            }
        } catch { /* 取不到 session 視同匿名 */ }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
            headers.Authorization = `Bearer ${session.access_token}`;
        }

        const res = await fetch('/api/feedback/submit', {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            let payload: { error?: string } = {};
            try { payload = await res.json(); } catch { /* non-JSON */ }
            throw new Error(payload.error || `提交失敗 (HTTP ${res.status})`);
        }
    }
};
