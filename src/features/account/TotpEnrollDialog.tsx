import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../../components/ui/input-otp';
import { Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import { getSupabase } from '../../lib/supabase';

interface Props {
    open: boolean;
    onClose: () => void;
    onEnrolled: () => void; // 成功後呼叫，外層用以觸發備援碼產生
}

interface EnrollData {
    factorId: string;
    qrCode: string; // data URI
    secret: string;
}

/**
 * 初次啟用 2FA：呼叫 supabase.auth.mfa.enroll → 顯示 QR → user 輸入 OTP → mfa.verify
 *
 * 注意：mfa.verify 成功後 Supabase 會自動把 session 升 aal2，這代表
 * 後續呼叫 /api/account/totp-backup-codes（要求 aal2）會通過。
 */
export function TotpEnrollDialog({ open, onClose, onEnrolled }: Props) {
    const { t } = useTranslation('account');
    const [phase, setPhase] = useState<'init' | 'enrolling' | 'verify' | 'submitting'>('init');
    const [data, setData] = useState<EnrollData | null>(null);
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [secretCopied, setSecretCopied] = useState(false);

    const reset = () => {
        setPhase('init');
        setData(null);
        setOtp('');
        setError('');
        setSecretCopied(false);
    };

    const startEnroll = async () => {
        setPhase('enrolling');
        setError('');
        try {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase not available');
            const res = await supabase.auth.mfa.enroll({ factorType: 'totp' });
            if (res.error || !res.data) {
                throw new Error(res.error?.message || 'enroll failed');
            }
            setData({
                factorId: res.data.id,
                qrCode: res.data.totp.qr_code,
                secret: res.data.totp.secret,
            });
            setPhase('verify');
        } catch (e) {
            setError(e instanceof Error ? e.message : t('mfa.enroll.error.generic', '啟用失敗'));
            setPhase('init');
        }
    };

    const handleVerify = async () => {
        if (!data || otp.length !== 6) return;
        setPhase('submitting');
        setError('');
        try {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase not available');

            const challengeRes = await supabase.auth.mfa.challenge({ factorId: data.factorId });
            if (challengeRes.error || !challengeRes.data) {
                throw new Error(challengeRes.error?.message || 'challenge failed');
            }
            const verifyRes = await supabase.auth.mfa.verify({
                factorId: data.factorId,
                challengeId: challengeRes.data.id,
                code: otp,
            });
            if (verifyRes.error) {
                // 驗證失敗：清掉 OTP 但不關閉 dialog（user 可重試）
                setOtp('');
                setError(t('mfa.enroll.error.invalid', '驗證碼錯誤或已過期'));
                setPhase('verify');
                return;
            }
            onEnrolled();
            reset();
            // 不在這裡 onClose — 讓外層先彈備援碼 dialog 再關
        } catch (e) {
            setError(e instanceof Error ? e.message : t('mfa.enroll.error.generic', '啟用失敗'));
            setPhase('verify');
        }
    };

    const handleCopySecret = async () => {
        if (!data) return;
        try {
            await navigator.clipboard.writeText(data.secret);
            setSecretCopied(true);
            setTimeout(() => setSecretCopied(false), 2000);
        } catch { /* clipboard 不可用就不複製 */ }
    };

    const busy = phase === 'enrolling' || phase === 'submitting';

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) { reset(); onClose(); } }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('mfa.title', '兩步驟驗證 (2FA)')}</DialogTitle>
                    <DialogDescription>
                        {phase === 'init' && t('mfa.description', '啟用後登入需額外輸入 6 位數驗證碼。')}
                        {(phase === 'verify' || phase === 'submitting') && t('mfa.enroll.scanQr', '使用驗證器 App 掃描 QR Code')}
                    </DialogDescription>
                </DialogHeader>

                {phase === 'init' && (
                    <div className="space-y-3">
                        {error && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> {error}
                            </div>
                        )}
                    </div>
                )}

                {(phase === 'verify' || phase === 'submitting') && data && (
                    <div className="space-y-4">
                        <div className="flex justify-center bg-white p-3 rounded-lg">
                            <img src={data.qrCode} alt="2FA QR Code" className="w-48 h-48" />
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                                {t('mfa.enroll.manualSecret', '或手動輸入金鑰')}
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-2 py-1.5 bg-muted/50 rounded text-xs font-mono break-all">
                                    {data.secret}
                                </code>
                                <Button variant="outline" size="sm" onClick={handleCopySecret} className="gap-1 shrink-0">
                                    {secretCopied
                                        ? <><Check className="w-3.5 h-3.5" /> {t('mfa.enroll.copied', '已複製')}</>
                                        : <><Copy className="w-3.5 h-3.5" /> {t('mfa.enroll.copySecret', '複製')}</>
                                    }
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/10">
                            <p className="text-sm font-medium">{t('mfa.enroll.verifyTitle', '輸入驗證碼確認')}</p>
                            <p className="text-xs text-muted-foreground">{t('mfa.enroll.verifyDesc', 'App 上顯示的 6 位數')}</p>
                            <div className="flex justify-center pt-1">
                                <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={busy}>
                                    <InputOTPGroup>
                                        {[0, 1, 2, 3, 4, 5].map(i => <InputOTPSlot key={i} index={i} />)}
                                    </InputOTPGroup>
                                </InputOTP>
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                                {error}
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={busy}>
                        {t('mfa.enroll.cancel', '取消')}
                    </Button>
                    {phase === 'init' && (
                        <Button onClick={startEnroll} disabled={busy} className="gap-2">
                            {phase === 'enrolling' && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t('mfa.enroll.button', '啟用 2FA')}
                        </Button>
                    )}
                    {(phase === 'verify' || phase === 'submitting') && (
                        <Button onClick={handleVerify} disabled={busy || otp.length !== 6} className="gap-2">
                            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t('mfa.enroll.verify', '驗證並啟用')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
