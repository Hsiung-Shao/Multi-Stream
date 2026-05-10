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
                // 把 supabase-js auth 的 navigator.locks mutex 換成 no-op：在
                // Cloudflare Access / 慢網路下觀察到 mfa.verify 完成 fetch 後
                // 內部 _saveSession 會卡住而不釋放 navigator lock，導致後續所有
                // supabase.auth.* 操作（getSession/refreshSession/listFactors/unenroll）
                // 都被無限期 hang 在 mutex 上。disable lock 後 multi-tab 同時 refresh
                // 可能拿到不同 token（極罕見），但單 tab 主流程不受影響。
                supabaseInstance = createClient(config.url, config.anonKey, {
                    auth: {
                        lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
                    },
                });
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
 * Raw fetch PostgREST endpoint，不依賴 supabase-js client（避免 mfa.verify 後
 * client 內部 race 卡住）。caller 提供 fresh access_token（建議用 manualRefreshSession 拿）。
 * 適用於：onMfaVerified 後立刻拉 profile（supabase.from 在 race window 中可能不 fire request）。
 */
export async function fetchSupabaseRest<T>(path: string, accessToken: string): Promise<T | null> {
  if (!cachedConfig) {
    await getSupabase();
    if (!cachedConfig) return null;
  }
  try {
    const res = await fetch(`${cachedConfig.url}/rest/v1/${path}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': cachedConfig.anonKey,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * 從 localStorage 直接讀 refresh_token，完全不依賴 supabase-js auth API。
 * supabase-js v2 預設把 session 存在 `sb-{ref}-auth-token`，value 為 JSON 或
 * base64 編碼 JSON。從 url hostname 第一段提取 ref。
 */
function readRefreshTokenFromStorage(): string | null {
    if (!cachedConfig) return null;
    try {
        const hostname = new URL(cachedConfig.url).hostname;
        const ref = hostname.split('.')[0];
        const storageKey = `sb-${ref}-auth-token`;
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;

        let parsed: unknown = null;
        // 嘗試 base64 編碼格式（supabase-js 某些版本）
        if (raw.startsWith('base64-')) {
            try { parsed = JSON.parse(atob(raw.substring('base64-'.length))); } catch { /* ignore */ }
        }
        if (!parsed) {
            try { parsed = JSON.parse(raw); } catch { /* ignore */ }
        }
        const obj = parsed as { refresh_token?: string; currentSession?: { refresh_token?: string } } | null;
        return obj?.refresh_token ?? obj?.currentSession?.refresh_token ?? null;
    } catch {
        return null;
    }
}

/**
 * 手動 refresh_token grant：徹底繞過 supabase-js 內部 mutex（mfa.verify hang 時 lock
 * 永遠不釋放，後續所有 supabase.auth.* 包含 getSession/refreshSession/setSession
 * 都會卡住）。直接從 localStorage 讀 refresh_token，raw fetch 打 gotrue refresh endpoint。
 * 回傳新的 access_token (升 aal2 後) 與 refresh_token。
 */
export async function manualRefreshSession(): Promise<{ access_token: string; refresh_token: string } | null> {
    if (!cachedConfig) {
        // ensure config is loaded
        await getSupabase();
        if (!cachedConfig) return null;
    }

    // 優先從 localStorage 直接讀（同步、不卡 mutex）；
    // 若沒有再 race-timeout 嘗試 supabase.auth.getSession() 作為備援
    let refreshToken: string | null = readRefreshTokenFromStorage();
    if (!refreshToken) {
        try {
            const supabase = await getSupabase();
            if (supabase) {
                const result = await Promise.race([
                    supabase.auth.getSession().then(r => r?.data?.session?.refresh_token ?? null),
                    new Promise<null>(r => setTimeout(() => r(null), 1500)),
                ]);
                refreshToken = result;
            }
        } catch { /* ignore */ }
    }
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

        // best-effort：把新 session 同步回 supabase-js cache（可能受 mutex 影響卡住，
        // 不阻塞主流程；fire-and-forget）
        (async () => {
            try {
                const sb = await getSupabase();
                if (sb) {
                    await Promise.race([
                        sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token }),
                        new Promise(r => setTimeout(r, 2000)),
                    ]);
                }
            } catch { /* ignore */ }
        })();

        return { access_token: data.access_token, refresh_token: data.refresh_token };
    } catch {
        return null;
    }
}
