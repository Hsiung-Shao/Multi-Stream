import { FeedbackFormData } from './FeedbackTypes';
import { hasStoredSession } from '../../lib/hasStoredSession';

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
 * 取 token 的逾時：
 * - 本機沒有 Supabase session（匿名，目前幾乎所有人）：直接匿名送出，不載入 SDK、不打 config（hasStoredSession）
 * - 有 session：載入 SDK、取 client、getSession 整段合計最多 5 秒，逾時就當匿名送出（supabase auth lock 可能卡住）
 * 之後的送出 fetch 另有 15 秒上限，最壞等待 5＋15 秒。
 */
const TOKEN_TIMEOUT_MS = 5_000;
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
    if (typeof window === 'undefined' || !hasStoredSession()) return null;
    return withTimeout((async () => {
        const { getSupabase } = await import('../../lib/supabase');
        const supabase = await getSupabase();
        if (!supabase) return null;
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token ?? null;
    })(), TOKEN_TIMEOUT_MS);
}

export const FeedbackService = {
    /**
     * 送意見回饋到 Cloudflare Function /api/feedback/submit
     * Function 用 service_role 寫入 feedbacks 表（繞過 RLS），含 IP rate limit
     * 與先前直連 supabase.from('feedbacks').insert() 不同
     */
    sendFeedback: async (data: FeedbackPayload): Promise<void> => {
        // 取 token：沒登入直接匿名；有 session 時整段最多 5 秒。之後的 fetch 再有 15 秒上限
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
