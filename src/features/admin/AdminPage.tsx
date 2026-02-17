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

            const { data: { session } } = await client.auth.getSession();
            if (cancelled) return;

            setAuthState(session ? 'authenticated' : 'login');

            const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
                setAuthState(session ? 'authenticated' : 'login');
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
            <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                    <span className="text-[13px] text-zinc-600">載入中</span>
                </div>
            </div>
        );
    }

    if (authState === 'login') {
        if (!supabase) {
            return (
                <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 max-w-[320px] text-center">
                        <div className="w-10 h-10 rounded-xl bg-red-500/[0.08] border border-red-500/20 flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                        </div>
                        <p className="text-[14px] text-zinc-300 font-medium">Supabase 未設定</p>
                        <p className="text-[12px] text-zinc-600 leading-relaxed">
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
