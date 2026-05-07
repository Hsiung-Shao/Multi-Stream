import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let initPromise: Promise<SupabaseClient | null> | null = null;
let cachedConfig: { url: string; anonKey: string } | null = null;

/**
 * 取得 Supabase 客戶端（lazy 初始化）
 * 從 /api/supabase-config 取得連線資訊，首次呼叫時建立客戶端
 */
export const getSupabase = (): Promise<SupabaseClient | null> => {
    if (supabaseInstance) return Promise.resolve(supabaseInstance);

    if (!initPromise) {
        initPromise = fetch('/api/supabase-config')
            .then(res => {
                if (!res.ok) throw new Error(`Supabase Config Fetch Error: ${res.status}`);
                return res.json();
            })
            .then((config: { url: string | null; anonKey: string | null }) => {
                if (!config.url || !config.anonKey) {
                    console.warn('Supabase config incomplete. Supabase features disabled.');
                    return null;
                }

                cachedConfig = { url: config.url, anonKey: config.anonKey };
                supabaseInstance = createClient(config.url, config.anonKey);
                return supabaseInstance;
            })
            .catch(() => {
                console.warn('Failed to initialize Supabase');
                initPromise = null; // 允許重試
                return null;
            });
    }

    return initPromise;
};

/**
 * 手動 refresh_token grant：繞過 supabase-js 內部 mutex（mfa.verify hang 時 lock 不釋放，
 * 後續所有 supabase.auth.* 操作都會被卡住）。直接用 fetch 打 gotrue refresh endpoint。
 * 回傳新的 access_token (升 aal2 後) 與 refresh_token；同時嘗試 setSession 同步寫回 client cache。
 */
export async function manualRefreshSession(): Promise<{ access_token: string; refresh_token: string } | null> {
    const supabase = await getSupabase();
    if (!supabase || !cachedConfig) return null;
    let refreshToken: string | undefined;
    try {
        const { data } = await supabase.auth.getSession();
        refreshToken = data?.session?.refresh_token;
    } catch { /* ignore */ }
    if (!refreshToken) return null;

    try {
        const res = await fetch(`${cachedConfig.url}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': cachedConfig.anonKey,
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.access_token || !data?.refresh_token) return null;

        // best-effort：把新 session 同步回 supabase-js cache（可能受 mutex 影響卡住，但不阻塞主流程）
        Promise.race([
            supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token }),
            new Promise(r => setTimeout(r, 2000)),
        ]).catch(() => undefined);

        return { access_token: data.access_token, refresh_token: data.refresh_token };
    } catch {
        return null;
    }
}
