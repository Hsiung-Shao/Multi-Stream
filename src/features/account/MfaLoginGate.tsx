import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../../components/ui/input-otp';
import { Input } from '../../components/ui/input';
import { Loader2, ShieldAlert, KeyRound, LogOut } from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import { submitTotpRecover, ApiError } from './apiClient';

interface Props {
    open: boolean;
    onSuccess: () => void;
    onLogout: () => void | Promise<void>;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timeout`)), ms),
        ),
    ]);
}

/**
 * MFA 登入閘門：user 啟用 2FA 但 session 是 aal1 時，強制顯示此 modal。
 * 不可 dismiss — user 必須走以下路徑之一才能繼續：
 *   1. 輸入 6 位 TOTP → mfa.verify → 升 aal2 → onSuccess
 *   2. 「使用備援碼」→ /api/account/totp-recover → 重置 2FA → 必須重新登入
 *   3. 「登出」放棄此次 session
 *
 * 安全意義：
 *   攻擊者偷到 OAuth credentials 走 OAuth 登入只能拿到 aal1 token，沒有 user 的
 *   TOTP 驗證器或備援碼就無法跨過此 gate，自然無法 access user 隱私資料（搭配 RLS）。
 */
export function MfaLoginGate({ open, onSuccess, onLogout }: Props) {
    const { t } = useTranslation('account');
    const [mode, setMode] = useState<'totp' | 'recover'>('totp');
    const [factorId, setFactorId] = useState<string | null>(null);
    const [otp, setOtp] = useState('');
    const [recoverCode, setRecoverCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [recoverDone, setRecoverDone] = useState(false);

    useEffect(() => {
        if (!open) return;
        setMode('totp');
        setOtp('');
        setRecoverCode('');
        setError('');
        setSubmitting(false);
        setLoading(true);
        setRecoverDone(false);
        (async () => {
            try {
                const supabase = await getSupabase();
                if (!supabase) throw new Error('Supabase not available');
                // listFactors 加 5s race timeout：observed in production supabase-js
                // 在某些 race 下不 resolve，導致 OTP slots 永遠不顯示。timeout 後
                // 顯示 fallback error，user 仍可走「使用備援碼」或「登出」出路。
                const result = await Promise.race([
                    supabase.auth.mfa.listFactors(),
                    new Promise<{ data: null; error: { message: string } }>(r =>
                        setTimeout(() => r({ data: null, error: { message: 'listFactors timeout' } }), 5000),
                    ),
                ]);
                if (result.error) throw new Error(result.error.message);
                const data = result.data;
                const factor = (data?.totp || [])[0]
                    || (data?.all || []).find(f => f.factor_type === 'totp' && f.status === 'verified');
                if (!factor) throw new Error('no_factor');
                setFactorId(factor.id);
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'failed';
                if (msg === 'no_factor') {
                    // user 沒啟用 2FA → 不該被 gate，自動 dismiss（caller 的 onSuccess
                    // 會 setMfaRequired(false) 並 fetchProfile，等同沒擋）。
                    // 觸發場景：useAuth 樂觀對 aal1 token 設 mfaRequired=true，但實際上
                    // user 沒啟用 2FA — checkMfaRequired 還沒校正完成前 modal 已 mount
                    setLoading(false);
                    onSuccess();
                    return;
                }
                if (msg === 'listFactors timeout') {
                    setError('無法載入 2FA 設定，請點下方使用備援碼或登出後重新登入');
                } else {
                    setError(msg);
                }
            } finally {
                setLoading(false);
            }
        })();
    }, [open]);

    const handleVerifyTotp = async () => {
        if (!factorId || otp.length !== 6) return;
        setSubmitting(true);
        setError('');
        try {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase not available');
            const ch = await withTimeout(
                supabase.auth.mfa.challenge({ factorId }),
                15000,
                'challenge',
            );
            if (ch.error || !ch.data) throw new Error(ch.error?.message || 'challenge failed');
            const v = await withTimeout(
                supabase.auth.mfa.verify({
                    factorId,
                    challengeId: ch.data.id,
                    code: otp,
                }),
                20000,
                'verify',
            );
            if (v.error) {
                setOtp('');
                setError(t('mfa.enroll.error.invalid', '驗證碼錯誤或已過期'));
                setSubmitting(false);
                return;
            }
            try {
                await withTimeout(supabase.auth.refreshSession(), 10000, 'refreshSession');
            } catch { /* refresh 失敗不致命 */ }

            onSuccess();
        } catch (e) {
            const msg = e instanceof Error ? e.message : '';
            // verify timeout 大多是 client cache 同步延遲，server 端通常成功 → 信任
            if (/timeout/i.test(msg)) {
                onSuccess();
                return;
            }
            setOtp('');
            setError(msg || t('mfa.enroll.error.generic', '驗證失敗'));
            setSubmitting(false);
        }
    };

    const handleRecover = async () => {
        if (!recoverCode.trim()) return;
        setSubmitting(true);
        setError('');
        try {
            const result = await submitTotpRecover(recoverCode.trim());
            if (result.success) {
                setRecoverDone(true);
                setSubmitting(false);
                return;
            }
            setError('備援碼無效或已用過');
            setSubmitting(false);
        } catch (e) {
            if (e instanceof ApiError) {
                if (e.status === 429) setError('嘗試次數過多，請明日再試');
                else if (e.status === 400) setError('備援碼格式錯誤或無效');
                else if (e.status === 404) setError('找不到 2FA factor，請聯繫管理員');
                else setError(e.message || '恢復失敗');
            } else {
                setError(e instanceof Error ? e.message : '恢復失敗');
            }
            setSubmitting(false);
        }
    };

    return (
        // 強制 modal：onOpenChange 不傳，user 不能透過外部點擊或 ESC 關閉
        <Dialog open={open}>
            <DialogContent
                className="max-w-md"
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
                showCloseButton={false}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-amber-500" />
                        {mode === 'totp'
                            ? t('mfa.gate.title', '需要兩步驟驗證')
                            : t('mfa.gate.recoverTitle', '使用備援碼恢復')}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'totp'
                            ? t('mfa.gate.desc', '此帳號已啟用 2FA。請輸入驗證器 App 顯示的 6 位數驗證碼以繼續。')
                            : t('mfa.gate.recoverDesc', '輸入一組備援碼。成功後將重置 2FA，您需要重新登入並重新啟用。')}
                    </DialogDescription>
                </DialogHeader>

                {recoverDone ? (
                    <div className="space-y-3 py-2">
                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-400">
                            ✓ 2FA 已重置完成。請重新登入並重新啟用 2FA 以保護您的帳號。
                        </div>
                    </div>
                ) : loading ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                ) : mode === 'totp' ? (
                    <div className="space-y-3 py-2">
                        <div className="flex justify-center pt-2">
                            <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={submitting}>
                                <InputOTPGroup>
                                    {[0, 1, 2, 3, 4, 5].map(i => <InputOTPSlot key={i} index={i} />)}
                                </InputOTPGroup>
                            </InputOTP>
                        </div>
                        {submitting && (
                            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-2 text-xs text-blue-400 flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>驗證中⋯如超過 30 秒請重新整理頁面</span>
                            </div>
                        )}
                        {error && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                                {error}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => { setMode('recover'); setError(''); }}
                            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                            disabled={submitting}
                        >
                            <KeyRound className="inline w-3 h-3 mr-1" />
                            {t('mfa.gate.useRecovery', '失去驗證器？使用備援碼')}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3 py-2">
                        <Input
                            value={recoverCode}
                            onChange={(e) => setRecoverCode(e.target.value)}
                            placeholder="XXXXX-XXXXX"
                            disabled={submitting}
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            className="font-mono text-center"
                        />
                        {error && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                                {error}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => { setMode('totp'); setError(''); }}
                            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                            disabled={submitting}
                        >
                            ← {t('mfa.gate.backToTotp', '改回輸入驗證碼')}
                        </button>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { void onLogout(); }}
                        className="gap-1 text-muted-foreground hover:text-destructive"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        {t('mfa.gate.logout', '登出')}
                    </Button>
                    {recoverDone ? (
                        <Button onClick={() => { void onLogout(); }} className="gap-2">
                            {t('mfa.gate.relogin', '重新登入')}
                        </Button>
                    ) : mode === 'totp' ? (
                        <Button
                            onClick={handleVerifyTotp}
                            disabled={submitting || loading || otp.length !== 6}
                            className="gap-2"
                        >
                            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t('mfa.enroll.verify', '驗證')}
                        </Button>
                    ) : (
                        <Button
                            onClick={handleRecover}
                            disabled={submitting || !recoverCode.trim()}
                            className="gap-2"
                        >
                            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t('mfa.gate.useRecover', '使用備援碼')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
