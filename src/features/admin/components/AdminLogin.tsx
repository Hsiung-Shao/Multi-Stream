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
                setError(authError.message === 'Invalid login credentials'
                    ? '帳號或密碼錯誤'
                    : authError.message);
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
                        <Shield className="w-5 h-5 text-zinc-400" />
                    </div>
                    <h1 className="text-[15px] font-medium text-zinc-200 tracking-tight">
                        MultiStream Admin
                    </h1>
                    <p className="text-[13px] text-zinc-500 mt-1">
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

                <p className="text-[11px] text-zinc-700 text-center mt-6">
                    僅限授權管理員存取
                </p>
            </div>
        </div>
    );
}
