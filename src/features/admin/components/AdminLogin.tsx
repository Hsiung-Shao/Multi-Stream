import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Shield, Eye, EyeOff, Loader2, KeyRound, ArrowLeft } from 'lucide-react';

interface AdminLoginProps {
    supabase: SupabaseClient;
    onSuccess: () => void;
}

type Step = 'password' | 'mfa';

export function AdminLogin({ supabase, onSuccess }: AdminLoginProps) {
    const [step, setStep] = useState<Step>('password');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [code, setCode] = useState('');
    const [factorId, setFactorId] = useState('');
    const [challengeId, setChallengeId] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                setError(authError.message === 'Invalid login credentials'
                    ? '帳號或密碼錯誤'
                    : authError.message);
                return;
            }

            // 密碼通過後,檢查是否需要 TOTP 二階驗證(AAL2)
            const { data: aal, error: aalError } =
                await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (aalError) {
                setError(aalError.message);
                return;
            }

            if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
                // 需要 TOTP:建立 challenge 並切換到驗證碼輸入畫面
                const { data: factors, error: factorsError } =
                    await supabase.auth.mfa.listFactors();
                if (factorsError) {
                    setError(factorsError.message);
                    return;
                }
                const totp = factors.totp?.[0];
                if (!totp) {
                    setError('帳號未綁定驗證器,無法完成二階驗證');
                    return;
                }
                const { data: challenge, error: challengeError } =
                    await supabase.auth.mfa.challenge({ factorId: totp.id });
                if (challengeError) {
                    setError(challengeError.message);
                    return;
                }
                setFactorId(totp.id);
                setChallengeId(challenge.id);
                setCode('');
                setStep('mfa');
                return;
            }

            // 無需 MFA(未綁定驗證器)→ 直接完成
            onSuccess();
        } catch {
            setError('登入時發生錯誤，請稍後再試');
        } finally {
            setLoading(false);
        }
    };

    const handleMfaSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (loading || code.length !== 6) return; // 防重複送出 / 不足 6 碼
        setError('');
        setLoading(true);

        try {
            const { error: verifyError } = await supabase.auth.mfa.verify({
                factorId,
                challengeId,
                code: code.trim(),
            });

            if (verifyError) {
                setError('驗證碼錯誤或已過期,請重新輸入');
                setCode(''); // 清空以便重打新碼後再次自動驗證(TOTP 每 30s 換碼)
                return;
            }

            onSuccess();
        } catch {
            setError('驗證時發生錯誤，請稍後再試');
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    // 輸入滿 6 碼即自動送出驗證(免按鈕)。effect 僅在 code/step 變動時觸發:
    // 5→6 觸發一次;驗證失敗會清空 code(length 0 不觸發),重打到 6 碼才再次觸發 → 不會無限迴圈。
    useEffect(() => {
        if (step === 'mfa' && code.length === 6 && !loading) {
            handleMfaSubmit();
        }
        // handleMfaSubmit 依當下 render 的 code/factorId/challengeId 閉包,毋須列入 deps
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, step]);

    const handleBackToPassword = async () => {
        // 退回密碼步驟前登出 aal1 session,避免殘留半登入狀態
        setError('');
        setCode('');
        setStep('password');
        try {
            await supabase.auth.signOut();
        } catch {
            // 忽略登出錯誤
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#09090b] relative overflow-hidden">
            {/* Subtle grid background */}
            <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
                    backgroundSize: '64px 64px',
                }}
            />

            {/* Radial glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/[0.04] rounded-full blur-[120px]" />

            <div className="relative w-full max-w-[380px] mx-4">
                {/* Logo area */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.08] mb-4 backdrop-blur-sm">
                        {step === 'mfa'
                            ? <KeyRound className="w-5 h-5 text-zinc-400" />
                            : <Shield className="w-5 h-5 text-zinc-400" />}
                    </div>
                    <h1 className="text-[15px] font-medium text-zinc-200 tracking-tight">
                        MultiStream Admin
                    </h1>
                    <p className="text-[13px] text-zinc-500 mt-1">
                        {step === 'mfa' ? '二階驗證' : '回饋管理後台'}
                    </p>
                </div>

                {step === 'password' ? (
                    /* Login form */
                    <form onSubmit={handlePasswordSubmit} className="space-y-3">
                        <div>
                            <Input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="Email"
                                required
                                autoComplete="email"
                                autoFocus
                                className="h-10 bg-white/[0.04] border-white/[0.08] text-zinc-200 placeholder:text-zinc-600 rounded-lg text-[13px] focus-visible:ring-1 focus-visible:ring-blue-500/40 focus-visible:border-blue-500/40 transition-colors"
                            />
                        </div>
                        <div className="relative">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="密碼"
                                required
                                autoComplete="current-password"
                                className="h-10 bg-white/[0.04] border-white/[0.08] text-zinc-200 placeholder:text-zinc-600 rounded-lg text-[13px] pr-10 focus-visible:ring-1 focus-visible:ring-blue-500/40 focus-visible:border-blue-500/40 transition-colors"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/[0.08] border border-red-500/20">
                                <div className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                                <p className="text-[12px] text-red-400">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-10 bg-white/[0.08] hover:bg-white/[0.12] text-zinc-200 border border-white/[0.08] rounded-lg text-[13px] font-medium transition-all duration-200 disabled:opacity-40"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                    驗證中
                                </>
                            ) : '登入'}
                        </Button>
                    </form>
                ) : (
                    /* MFA form */
                    <form onSubmit={handleMfaSubmit} className="space-y-3">
                        <p className="text-[12px] text-zinc-500 text-center leading-relaxed mb-1">
                            請輸入驗證器 App 顯示的 6 位數驗證碼
                        </p>
                        <Input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={code}
                            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            required
                            autoFocus
                            className="h-12 bg-white/[0.04] border-white/[0.08] text-zinc-100 placeholder:text-zinc-700 rounded-lg text-center text-[20px] tracking-[0.5em] font-mono focus-visible:ring-1 focus-visible:ring-blue-500/40 focus-visible:border-blue-500/40 transition-colors"
                        />

                        {error && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/[0.08] border border-red-500/20">
                                <div className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                                <p className="text-[12px] text-red-400">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading || code.length !== 6}
                            className="w-full h-10 bg-white/[0.08] hover:bg-white/[0.12] text-zinc-200 border border-white/[0.08] rounded-lg text-[13px] font-medium transition-all duration-200 disabled:opacity-40"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                    驗證中
                                </>
                            ) : '驗證並登入'}
                        </Button>

                        <button
                            type="button"
                            onClick={handleBackToPassword}
                            disabled={loading}
                            className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
                        >
                            <ArrowLeft className="w-3 h-3" />
                            返回
                        </button>
                    </form>
                )}

                <p className="text-[11px] text-zinc-700 text-center mt-6">
                    僅限授權管理員存取
                </p>
            </div>
        </div>
    );
}
