import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';

interface AdminLoginProps {
    supabase: SupabaseClient;
    onSuccess: () => void;
}

export function AdminLogin({ supabase, onSuccess }: AdminLoginProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                // 不直接顯示 Supabase 原始錯誤訊息，避免洩漏系統資訊
                setError(authError.message === 'Invalid login credentials'
                    ? '帳號或密碼錯誤'
                    : '登入失敗，請稍後再試');
                return;
            }

            onSuccess();
        } catch {
            setError('登入時發生錯誤，請稍後再試');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 relative overflow-hidden">
            {/* Subtle grid background */}
            <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
                    backgroundSize: '64px 64px',
                }}
            />

            {/* Radial glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/[0.06] rounded-full blur-[120px]" />

            <div className="relative w-full max-w-[400px] mx-4">
                {/* Card container */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 backdrop-blur-sm">
                    {/* Logo area */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 mb-4">
                            <Shield className="w-6 h-6 text-blue-400" />
                        </div>
                        <h1 className="text-[17px] font-semibold text-zinc-100 tracking-tight">
                            MultiStream Admin
                        </h1>
                        <p className="text-[13px] text-zinc-400 mt-1">
                            回饋管理後台
                        </p>
                    </div>

                    {/* Login form */}
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div>
                            <Input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="Email"
                                required
                                autoComplete="email"
                                autoFocus
                                className="h-10 bg-zinc-800/50 border-zinc-700 text-zinc-200 placeholder:text-zinc-500 rounded-lg text-[13px] focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500/50 transition-colors"
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
                                className="h-10 bg-zinc-800/50 border-zinc-700 text-zinc-200 placeholder:text-zinc-500 rounded-lg text-[13px] pr-10 focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500/50 transition-colors"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/25">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                                <p className="text-[13px] text-red-400">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[13px] font-medium transition-all duration-200 disabled:opacity-40 border-0"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                    驗證中
                                </>
                            ) : '登入'}
                        </Button>
                    </form>
                </div>

                <p className="text-[12px] text-zinc-500 text-center mt-6">
                    僅限授權管理員存取
                </p>
            </div>
        </div>
    );
}
