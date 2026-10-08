import { FeedbackFormData } from './FeedbackTypes';

export interface FeedbackPayload extends FeedbackFormData {
    userAgent: string;
    screenResolution: string;
    windowSize: string;
    theme: string;
    version: string;
    /** 表單已告知「內容會公開在 /status」：後端只公開帶這個旗標的回報 */
    publicNotice: true;
}

/** 取 session 的上限：supabase auth lock 卡住時 getSession 可能永遠不回，逾時就當匿名送出 */
const SESSION_TIMEOUT_MS = 2_000;
const SUBMIT_TIMEOUT_MS = 15_000;

async function getAccessToken(): Promise<string | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), SESSION_TIMEOUT_MS); });
    const lookup = (async (): Promise<string | null> => {
        const { getSupabase } = await import('../../lib/supabase');
        const supabase = await getSupabase();
        if (!supabase) return null;
        const { data: sd } = await supabase.auth.getSession();
        return sd?.session?.access_token ?? null;
    })().catch(() => null); // 取不到 session 視同匿名
    try {
        return await Promise.race([lookup, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

export const FeedbackService = {
    /**
     * 送意見回饋到 Cloudflare Function /api/feedback/submit
     * Function 用 service_role 寫入 feedbacks 表（繞過 RLS），含 IP rate limit
     * 與先前直連 supabase.from('feedbacks').insert() 不同
     */
    sendFeedback: async (data: FeedbackPayload): Promise<void> => {
        // getSession 另有 2 秒上限（整段取 token 含動態載入），之後的 fetch 再有 15 秒上限
        const accessToken = await getAccessToken();

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
        }

        // client fetch 一律要有逾時：卡住時送出鍵才不會永遠轉圈
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), SUBMIT_TIMEOUT_MS);
        let res: Response;
        try {
            res = await fetch('/api/feedback/submit', {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
                signal: ctrl.signal,
            });
        } finally {
            clearTimeout(timer);
        }
        if (!res.ok) {
            let payload: { error?: string } = {};
            try { payload = await res.json(); } catch { /* non-JSON */ }
            throw new Error(payload.error || `提交失敗 (HTTP ${res.status})`);
        }
    }
};
