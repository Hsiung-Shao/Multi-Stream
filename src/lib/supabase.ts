import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let initPromise: Promise<SupabaseClient | null> | null = null;

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

                supabaseInstance = createClient(config.url, config.anonKey);
                return supabaseInstance;
            })
            .catch(err => {
                console.warn('Failed to initialize Supabase:', err);
                initPromise = null; // 允許重試
                return null;
            });
    }

    return initPromise;
};
