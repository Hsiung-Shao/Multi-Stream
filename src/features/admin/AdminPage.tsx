import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../../lib/supabase';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { SEO } from '../../components/SEO';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 1,
        },
    },
});

type AuthState = 'loading' | 'login' | 'authenticated' | 'error';

const INIT_TIMEOUT_MS = 15_000;

export function AdminPage() {
    const [authState, setAuthState] = useState<AuthState>('loading');
    const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        let cancelled = false;
        let unsubscribeFn: (() => void) | null = null;

        const timer = setTimeout(() => {
            if (!cancelled) {
                setAuthState(prev => prev === 'loading' ? 'error' : prev);
                setErrorMessage('連線逾時，請檢查網路或 Supabase 設定');
            }
        }, INIT_TIMEOUT_MS);

        (async () => {
            try {
                const client = await getSupabase();
                if (cancelled) return;

                if (!client) {
                    setAuthState('login');
                    return;
                }

                setSupabase(client);

                const { data: { session }, error: sessionError } = await client.auth.getSession();
                if (cancelled) return;

                if (sessionError) {
                    console.error('Admin getSession error:', sessionError.message);
                    setAuthState('error');
                    setErrorMessage('驗證服務異常，請稍後再試');
                    return;
                }

                setAuthState(session ? 'authenticated' : 'login');

                const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
                    if (!cancelled) {
                        setAuthState(session ? 'authenticated' : 'login');
                    }
                });

                unsubscribeFn = () => subscription.unsubscribe();
            } catch (err) {
                if (!cancelled) {
                    console.error('Admin init error:', err);
                    setAuthState('error');
                    setErrorMessage('初始化失敗，請重新整理頁面');
                }
            }
        })();

        return () => {
            cancelled = true;
            clearTimeout(timer);
            unsubscribeFn?.();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleLogout = async () => {
        if (supabase) {
            await supabase.auth.signOut();
        }
        setAuthState('login');
        queryClient.clear();
    };

    const handleRetry = () => {
        setAuthState('loading');
        setErrorMessage('');
        window.location.reload();
    };

    if (authState === 'loading') {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                    <span className="text-[13px] text-zinc-400">載入中</span>
                </div>
            </div>
        );
    }

    if (authState === 'error') {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 max-w-[320px] text-center bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                    <p className="text-[14px] text-zinc-200 font-medium">連線異常</p>
                    <p className="text-[13px] text-zinc-400 leading-relaxed">
                        {errorMessage}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 mt-2"
                        onClick={handleRetry}
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        重試
                    </Button>
                </div>
            </div>
        );
    }

    if (authState === 'login') {
        if (!supabase) {
            return (
                <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 max-w-[320px] text-center bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                        </div>
                        <p className="text-[14px] text-zinc-200 font-medium">Supabase 未設定</p>
                        <p className="text-[13px] text-zinc-400 leading-relaxed">
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
            <SEO
                title="Admin | MultiStream Hub"
                description="Internal admin console."
                pathWithoutLang="/admin"
                robots="noindex, nofollow"
            />
            <AdminDashboard onLogout={handleLogout} />
        </QueryClientProvider>
    );
}
