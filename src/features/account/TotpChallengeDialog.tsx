import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../../components/ui/input-otp';
import { Loader2 } from 'lucide-react';
import { getSupabase } from '../../lib/supabase';

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void | Promise<void>; // session 已升 aal2 後呼叫（可為 async）
    title?: string;
    description?: string;
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
 * 已 enroll 的 user 想做 aal2-required 操作（重新產生備援碼、停用 2FA）時，
 * 用此 dialog 重新驗證 TOTP 升級 session 至 aal2。
 *
 * 流程：
 * 1. listFactors 找出 verified TOTP factor
 * 2. challenge → 給 challengeId
 * 3. user 輸入 6 位數 → verify → Supabase 自動升 session 至 aal2
 */
export function TotpChallengeDialog({ open, onClose, onSuccess, title, description }: Props) {
    const { t } = useTranslation('account');
    const [factorId, setFactorId] = useState<string | null>(null);
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!open) return;
        setOtp('');
        setError('');
        setSubmitting(false);
        setLoading(true);
        (async () => {
            try {
                const supabase = await getSupabase();
                if (!supabase) throw new Error('Supabase not available');
                const { data, error: lfErr } = await supabase.auth.mfa.listFactors();
                if (lfErr) throw new Error(lfErr.message);
                const factor = (data?.totp || [])[0] || (data?.all || []).find(f => f.factor_type === 'totp' && f.status === 'verified');
                if (!factor) throw new Error('no_factor');
                setFactorId(factor.id);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'failed');
            } finally {
                setLoading(false);
            }
        })();
    }, [open]);

    const handleVerify = async () => {
        if (!factorId || otp.length !== 6) return;
        console.log('[TotpChallenge] handleVerify start, factorId=', factorId);
        setSubmitting(true);
        setError('');
        try {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase not available');
            console.log('[TotpChallenge] before challenge');
            const ch = await withTimeout(
                supabase.auth.mfa.challenge({ factorId }),
                15000,
                'challenge',
            );
            console.log('[TotpChallenge] challenge result error=', ch.error, 'data=', !!ch.data);
            if (ch.error || !ch.data) throw new Error(ch.error?.message || 'challenge failed');
            console.log('[TotpChallenge] before verify');
            const v = await withTimeout(
                supabase.auth.mfa.verify({
                    factorId,
                    challengeId: ch.data.id,
                    code: otp,
                }),
                20000,
                'verify',
            );
            console.log('[TotpChallenge] verify result error=', v.error);
            if (v.error) {
                setOtp('');
                setError(t('mfa.enroll.error.invalid', '驗證碼錯誤或已過期'));
                setSubmitting(false);
                return;
            }
            console.log('[TotpChallenge] verify ok, before refreshSession');
            try {
                await withTimeout(supabase.auth.refreshSession(), 10000, 'refreshSession');
            } catch (e) { console.warn('[TotpChallenge] refresh threw', e); }

            console.log('[TotpChallenge] calling onSuccess (happy)');
            try {
                await onSuccess();
            } catch (e) { console.error('[TotpChallenge] onSuccess threw', e); }
            console.log('[TotpChallenge] onSuccess done, calling onClose');
            onClose();
        } catch (e) {
            const msg = e instanceof Error ? e.message : '';
            console.warn('[TotpChallenge] handleVerify catch, msg=', msg);

            if (/timeout/i.test(msg)) {
                try {
                    const sb = await getSupabase();
                    if (sb) {
                        await Promise.race([
                            sb.auth.refreshSession(),
                            new Promise(r => setTimeout(r, 3000)),
                        ]).catch(() => undefined);
                    }
                } catch { /* ignore */ }
                console.log('[TotpChallenge] calling onSuccess (timeout-path)');
                try {
                    await onSuccess();
                } catch (e2) { console.error('[TotpChallenge] onSuccess threw (timeout)', e2); }
                console.log('[TotpChallenge] onSuccess done (timeout), calling onClose');
                onClose();
                return;
            }

            setOtp('');
            setError(msg || t('mfa.enroll.error.generic', '失敗'));
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) onClose(); }}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{title || t('mfa.enroll.verifyTitle', '輸入驗證碼')}</DialogTitle>
                    <DialogDescription>
                        {description || t('mfa.enroll.verifyDesc', 'App 上顯示的 6 位數')}
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="space-y-3">
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
                                <span>驗證中⋯如超過 15 秒請重新整理頁面</span>
                            </div>
                        )}
                        {error && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                                {error}
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>
                        {t('mfa.enroll.cancel', '取消')}
                    </Button>
                    <Button onClick={handleVerify} disabled={submitting || loading || otp.length !== 6} className="gap-2">
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {t('mfa.enroll.verify', '驗證')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
