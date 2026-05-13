import { useEffect, useState } from 'react';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2, AlertTriangle, ShieldOff, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { SEO } from '../../components/SEO';
import { checkAdminPermission, ApiError } from '../vtuber/apiClient';
import { useUIStore } from '../../store/useUIStore';
import { useAuthContext } from '../../contexts/AuthContext';
import { getSupabase } from '../../lib/supabase';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 1,
        },
    },
});

// 'mfa_required' 不在這個 state 機器內 — 由全域 MfaLoginGate（AuthProvider mount）
// 接管 aal2 升級 UI；AdminPage 在 mfaRequired=true 時純粹不渲染 dashboard。
type PermissionState = 'checking' | 'allowed' | 'forbidden' | 'error';

export function AdminPage() {
    const { user, mfaRequired, isLoading, logout } = useAuthContext();
    const [permissionState, setPermissionState] = useState<PermissionState>('checking');
    const [trustLevel, setTrustLevel] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const setPage = useUIStore(s => s.setPage);

    // user 登入且通過 MFA → 後端 double-check trust_level（前端 enforce + 後端 RLS 雙保險）
    // user/mfaRequired 變動時重置 → 重新檢查（例如 verify 完成 reload 後）
    useEffect(() => {
        if (isLoading) return;
        if (!user || mfaRequired) {
            setPermissionState('checking');
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const result = await checkAdminPermission();
                if (cancelled) return;
                setTrustLevel(result.trust_level);
                setPermissionState(result.allowed ? 'allowed' : 'forbidden');
            } catch (err) {
                if (cancelled) return;
                // 401 mfa_required: 理論上 mfaRequired 已被前端 gate 攔下，這裡是雙保險
                // 401 unauthenticated: session 失效 → 保守視為 forbidden（loginUI 會在下一次 render 接管）
                // 其他錯誤：顯示重試 UI
                if (err instanceof ApiError) {
                    if (err.status === 401 || err.status === 403) {
                        setTrustLevel(err.payload?.trust_level ?? null);
                        setPermissionState('forbidden');
                        return;
                    }
                }
                setPermissionState('error');
                setErrorMessage('權限驗證失敗，請稍後再試');
                setTrustLevel(null);
            }
        })();
        return () => { cancelled = true; };
    }, [user, mfaRequired, isLoading]);

    const handleLogout = async () => {
        await logout();
        queryClient.clear();
    };

    const handleRetry = () => {
        setPermissionState('checking');
        setErrorMessage('');
        window.location.reload();
    };

    // SEO 提到所有分支之上單一 mount，避免分支切換時 race（兩個 SEO useEffect
    // 對 document.head 同時操作可能短暫顯示混合狀態）
    const seoEl = (
        <SEO
            title="Admin | MultiStream Hub"
            description="Internal admin console."
            pathWithoutLang="/admin"
            robots="noindex, nofollow"
        />
    );

    // 1. AuthContext 仍在 init → loading
    if (isLoading) {
        return (
            <>
                {seoEl}
                <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                        <span className="text-[13px] text-zinc-400">載入中</span>
                    </div>
                </div>
            </>
        );
    }

    // 2. 未登入 → 顯示登入卡。AdminLogin 需要 supabase client；getSupabase 失敗 fallback。
    if (!user) {
        return <AdminLoginWrapper seoEl={seoEl} />;
    }

    // 3. user 啟用 2FA 但尚未 aal2 → 全域 MfaLoginGate 已蓋上，AdminPage 不渲染 dashboard。
    //    顯示一段輕量提示作為背景（gate 半透明可隱約看到），同時避免 dashboard 在 aal1 token 下嘗試拉 RLS 資料。
    if (mfaRequired) {
        return (
            <>
                {seoEl}
                <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 max-w-[360px] text-center bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
                            <ShieldAlert className="w-4 h-4 text-amber-400" />
                        </div>
                        <p className="text-[14px] text-zinc-200 font-medium">需要二階段驗證</p>
                        <p className="text-[13px] text-zinc-400 leading-relaxed">
                            進入後台前請完成 TOTP 驗證
                        </p>
                    </div>
                </div>
            </>
        );
    }

    // 4. 後端 check-permission 結果分支
    if (permissionState === 'checking') {
        return (
            <>
                {seoEl}
                <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                        <span className="text-[13px] text-zinc-400">驗證權限中</span>
                    </div>
                </div>
            </>
        );
    }

    if (permissionState === 'forbidden') {
        return (
            <>
                {seoEl}
                <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 max-w-[360px] text-center bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
                            <ShieldOff className="w-4 h-4 text-amber-400" />
                        </div>
                        <p className="text-[14px] text-zinc-200 font-medium">無權限存取後台</p>
                        <p className="text-[13px] text-zinc-400 leading-relaxed">
                            此頁面僅限 admin / moderator 使用。<br />
                            當前帳號等級：<span className="text-zinc-300">{trustLevel ?? '未知'}</span>
                        </p>
                        <Button variant="outline" size="sm" className="mt-2" onClick={() => setPage('home')}>
                            返回首頁
                        </Button>
                    </div>
                </div>
            </>
        );
    }

    if (permissionState === 'error') {
        return (
            <>
                {seoEl}
                <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 max-w-[320px] text-center bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                        </div>
                        <p className="text-[14px] text-zinc-200 font-medium">連線異常</p>
                        <p className="text-[13px] text-zinc-400 leading-relaxed">
                            {errorMessage}
                        </p>
                        <Button variant="outline" size="sm" className="mt-2" onClick={handleRetry}>
                            重試
                        </Button>
                    </div>
                </div>
            </>
        );
    }

    // 5. allowed
    return (
        <QueryClientProvider client={queryClient}>
            {seoEl}
            <AdminDashboard onLogout={handleLogout} />
        </QueryClientProvider>
    );
}

/**
 * AdminLogin 仍需要 supabase client 直接呼叫 signInWithPassword。
 * 用獨立 wrapper 取 client（失敗 fallback）以保持 AdminPage 主邏輯純由 useAuthContext 驅動。
 */
function AdminLoginWrapper({ seoEl }: { seoEl: React.ReactNode }) {
    const [supabase, setSupabase] = useState<Awaited<ReturnType<typeof getSupabase>> | null>(null);
    const [supabaseError, setSupabaseError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const client = await getSupabase();
                if (cancelled) return;
                if (!client) {
                    setSupabaseError(true);
                    return;
                }
                setSupabase(client);
            } catch {
                if (!cancelled) setSupabaseError(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (supabaseError) {
        return (
            <>
                {seoEl}
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
            </>
        );
    }

    if (!supabase) {
        return (
            <>
                {seoEl}
                <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                        <span className="text-[13px] text-zinc-400">載入中</span>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            {seoEl}
            {/* 登入成功後 onAuthStateChange 會在 useAuth 內觸發 user state 更新，
                AdminPage 自動切換到 mfaRequired/permission check 分支 */}
            <AdminLogin
                supabase={supabase}
                onSuccess={() => { /* no-op：依賴 useAuth 的 onAuthStateChange 自動切換 */ }}
            />
        </>
    );
}
