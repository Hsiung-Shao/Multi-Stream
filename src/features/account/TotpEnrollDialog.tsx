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
    /**
     * @deprecated 不再被內部呼叫。verify 成功（含 timeout-but-verified）一律設
     * sessionStorage `mfa_pending_backup_codes=pending` flag 並 onClose，
     * 由外層 reload + useEffect 偵測 `enrolled+0codes+flag` 補拿備援碼。
     * Prop 保留以最小化外部介面改動。
     */
    onEnrolled?: () => Promise<void> | void;
}

// 給 supabase mfa.challenge / verify 加 client-side timeout — 在 Cloudflare Access
// 環境下偶爾觀察到 client promise 不返回（DB 端已 verify 完）。timeout 後 catch
// 會把 phase 設回 verify，user 可重整看狀態（factor 已 verified 的話會自動進已啟用）。
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timeout`)), ms),
        ),
    ]);
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TotpEnrollDialog({ open, onClose, onEnrolled: _onEnrolled }: Props) {
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

            // 先清掉之前 enroll 但沒 verify 的 totp factor（避免 Supabase
            // 「friendly name already exists」422 — user 開過 dialog 又關掉時會殘留）
            try {
                const { data: factors } = await supabase.auth.mfa.listFactors();
                const all = (factors as { all?: Array<{ id: string; factor_type: string; status: string }> })?.all ?? [];
                const stale = all.filter(f => f.factor_type === 'totp' && f.status !== 'verified');
                for (const f of stale) {
                    await supabase.auth.mfa.unenroll({ factorId: f.id });
                }
            } catch { /* listFactors 失敗不致命，繼續嘗試 enroll */ }

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

    // 取消 / 關 dialog 時，把剛 enroll 但還沒 verify 的 factor 清掉。
    // 否則下次再開 dialog 又會撞到 422 friendly-name conflict。
    const cleanupAndClose = async () => {
        const factorId = data?.factorId;
        reset();
        onClose();
        if (factorId) {
            try {
                const supabase = await getSupabase();
                await supabase?.auth.mfa.unenroll({ factorId });
            } catch { /* best-effort */ }
        }
    };

    const handleVerify = async () => {
        if (!data || otp.length !== 6) return;
        setPhase('submitting');
        setError('');
        const factorId = data.factorId;
        try {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase not available');

            // timeout 拉長：Cloudflare Access / 慢網路下 supabase-js mfa.verify
            // 整個 promise（含 _saveSession）可能 >10s 才完成；timeout fall through
            // 也已交由 sessionStorage flag + useEffect 處理（不影響功能正確性）。
            const challengeRes = await withTimeout(
                supabase.auth.mfa.challenge({ factorId }),
                15000,
                'challenge',
            );
            if (challengeRes.error || !challengeRes.data) {
                throw new Error(challengeRes.error?.message || 'challenge failed');
            }
            const verifyRes = await withTimeout(
                supabase.auth.mfa.verify({
                    factorId,
                    challengeId: challengeRes.data.id,
                    code: otp,
                }),
                20000,
                'verify',
            );
            if (verifyRes.error) {
                setOtp('');
                setError(t('mfa.enroll.error.invalid', '驗證碼錯誤或已過期'));
                setPhase('verify');
                return;
            }
            try {
                await withTimeout(supabase.auth.refreshSession(), 5000, 'refreshSession');
            } catch { /* refresh 失敗不致命 — 外層 useEffect 會再 refresh 一次 */ }

            // happy path 也走 sessionStorage flag + 外層 useEffect 路徑（不再 inline 產 codes）。
            // mfa.verify 後 supabase-js 內部 _saveSession 與 client token cache 同步存在 race
            // window，立刻 generateBackupCodes 可能用舊 aal1 token 撞 403。統一收斂到 flag
            // 路徑可移除 inline retry 的脆弱性，由 useEffect 負責長 backoff 補拿備援碼。
            try { sessionStorage.setItem('mfa_pending_backup_codes', 'pending'); } catch { /* ignore */ }
            reset();
            onClose();
        } catch (e) {
            const msg = e instanceof Error ? e.message : '';

            // timeout：mfa.verify 的 fetch 通常已 200（server 端 verified），只是 supabase-js
            // 內部 _saveSession 卡在 mutex。checkFactorVerified 也用 supabase.auth.* 同樣會
            // 被卡，無法可靠判斷。直接信任 server 端已成功，設 flag + 關 dialog；外層 reload
            // 後 useEffect 會驗證 status.enrolled 並補拿備援碼（server 真的沒 verified 時 flag
            // 不會被消耗，下次再進來自然 ignore）。
            if (/timeout/i.test(msg)) {
                try { sessionStorage.setItem('mfa_pending_backup_codes', 'pending'); } catch { /* ignore */ }
                reset();
                onClose();
                return;
            }

            setOtp('');
            setError(msg || t('mfa.enroll.error.generic', '啟用失敗'));
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
        <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) cleanupAndClose(); }}>
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

                        <div className="space-y-2 pt-2 border-t border-border">
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

                        {phase === 'submitting' && (
                            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-2 text-xs text-blue-400 flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>驗證中⋯如超過 15 秒請重新整理頁面確認狀態</span>
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
                    <Button variant="outline" onClick={cleanupAndClose} disabled={busy}>
                        {t('mfa.enroll.cancel', '取消')}
                    </Button>
                    {phase === 'init' && (
                        <Button onClick={startEnroll} disabled={busy} className="gap-2">
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
