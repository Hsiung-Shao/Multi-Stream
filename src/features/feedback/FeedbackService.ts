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

/**
 * 兩段逾時分開：
 * - 載入 supabase chunk＋取得 client：網路慢時可能要幾秒，給 10 秒，避免已登入使用者被靜默當匿名
 * - getSession 本身：supabase auth lock 卡住時可能永遠不回，2 秒就放棄、當匿名送出
 */
const CLIENT_TIMEOUT_MS = 10_000;
const SESSION_TIMEOUT_MS = 2_000;
const SUBMIT_TIMEOUT_MS = 15_000;

/** 逾時或失敗都回 null（取不到 session 視同匿名） */
async function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); });
    try {
        return await Promise.race([task.catch(() => null), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

async function getAccessToken(): Promise<string | null> {
    const supabase = await withTimeout(import('../../lib/supabase').then((m) => m.getSupabase()), CLIENT_TIMEOUT_MS);
    if (!supabase) return null;
    const session = await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
    return session?.data?.session?.access_token ?? null;
}

export const FeedbackService = {
    /**
     * 送意見回饋到 Cloudflare Function /api/feedback/submit
     * Function 用 service_role 寫入 feedbacks 表（繞過 RLS），含 IP rate limit
     * 與先前直連 supabase.from('feedbacks').insert() 不同
     */
    sendFeedback: async (data: FeedbackPayload): Promise<void> => {
        // 取 token：載入 client 最多 10 秒、getSession 最多 2 秒；之後的 fetch 再有 15 秒上限
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
