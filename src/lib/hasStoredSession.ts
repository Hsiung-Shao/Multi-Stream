/**
 * localStorage 是否存有 Supabase session（預設 storage key：sb-<ref>-auth-token）。
 *
 * 匿名訪客（目前幾乎所有人）用它直接判定「沒登入」，不必只為了確認沒有 token 就載入整個 Supabase SDK
 * （getSupabase 首次呼叫會打 /api/supabase-config ＋ createClient）。公告與意見回饋共用。
 */
export function hasStoredSession(): boolean {
    try {
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
        }
    } catch {
        // localStorage 不可用 → 視為無 session
    }
    return false;
}
