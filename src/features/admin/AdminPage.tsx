import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../../lib/supabase';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 1,
        },
    },
});

type AuthState = 'loading' | 'login' | 'authenticated';

// 通過條件:有 session 且 AAL 已達標(未綁定 MFA 時 aal1 即可;已綁定 MFA 時必須升到 aal2)。
// 對應 feedbacks 的 RLS restrictive policy:已驗證 MFA 的 admin 需 aal2 才能讀寫。
async function isFullyAuthenticated(client: SupabaseClient): Promise<boolean> {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return false;

    const { data: aal, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !aal) return true; // 無法判定時不阻擋(沿用 session 存在即視為通過)
    if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return false;
    return true;
}

export function AdminPage() {
    const [authState, setAuthState] = useState<AuthState>('loading');
    const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const client = await getSupabase();
            if (cancelled) return;

            if (!client) {
                setAuthState('login');
                return;
            }

            setSupabase(client);

            const authed = await isFullyAuthenticated(client);
            if (cancelled) return;

            setAuthState(authed ? 'authenticated' : 'login');

            const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
                if (!session) {
                    setAuthState('login');
                    return;
                }
                // Supabase 已知死鎖:在 onAuthStateChange callback 內直接呼叫會取得 auth lock 的方法
                // (getSession / getAuthenticatorAssuranceLevel)會與 callback 本身持有的 lock 互鎖,
                // 造成 mfa.verify() 後 promise 永不 resolve、登入畫面卡在「驗證中」。
                // 解法:用 setTimeout 把 AAL 檢查推遲到 callback 結束、lock 釋放之後再執行。
                setTimeout(async () => {
                    const ok = await isFullyAuthenticated(client);
                    if (!cancelled) setAuthState(ok ? 'authenticated' : 'login');
                }, 0);
            });

            return () => subscription.unsubscribe();
        })();

        return () => { cancelled = true; };
    }, []);

    const handleLogout = async () => {
        if (supabase) {
            await supabase.auth.signOut();
        }
        setAuthState('login');
        queryClient.clear();
    };

    if (authState === 'loading') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                    <span className="text-[13px] text-muted-foreground">載入中</span>
                </div>
            </div>
        );
    }

    if (authState === 'login') {
        if (!supabase) {
            return (
                <div className="min-h-screen bg-background flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 max-w-[320px] text-center">
                        <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-destructive" />
                        </div>
                        <p className="text-[14px] text-foreground font-medium">Supabase 未設定</p>
                        <p className="text-[12px] text-muted-foreground leading-relaxed">
                            請確認 /api/supabase-config 端點正常運作
                        </p>
                    </div>
                </div>
            );
        }
        return (
            <AdminLogin
                supabase={supabase}
                onSuccess={() => setAuthState('authenticated')}
            />
        );
    }

    if (!supabase) {
        return null;
    }

    return (
        <QueryClientProvider client={queryClient}>
            <AdminDashboard onLogout={handleLogout} />
        </QueryClientProvider>
    );
}
