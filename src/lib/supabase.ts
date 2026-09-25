// 只 import 型別：SDK 本體（未壓縮約 215 KB）在第一次 getSupabase() 時才動態載入，
// 不進首屏 entry（首頁、SEO 頁面都用不到 Supabase）
import type { SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let initPromise: Promise<SupabaseClient | null> | null = null;

/**
 * 取得 Supabase 客戶端（lazy 初始化）
 * 從 /api/supabase-config 取得連線資訊，首次呼叫時建立客戶端
 */
export const getSupabase = (): Promise<SupabaseClient | null> => {
    if (supabaseInstance) return Promise.resolve(supabaseInstance);

    if (!initPromise) {
        // 確認設定完整才下載 SDK chunk：環境沒設 Supabase（或設定請求失敗）時不白載 gzip 約 59 KB。
        // 代價是首次使用多一段串行下載，但只發生一次
        initPromise = fetch('/api/supabase-config')
            .then(res => {
                if (!res.ok) throw new Error(`Supabase Config Fetch Error: ${res.status}`);
                return res.json();
            })
            .then(async (config: { url: string | null; anonKey: string | null }) => {
                if (!config.url || !config.anonKey) {
                    console.warn('Supabase config incomplete. Supabase features disabled.');
                    return null;
                }

                const { createClient } = await import('@supabase/supabase-js');
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
