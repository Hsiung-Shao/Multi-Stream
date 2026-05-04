import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Loader2, Shield, ShieldCheck, KeyRound, AlertTriangle } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';
import {
    fetchTotpStatus,
    generateBackupCodes,
    ApiError,
    type TotpStatusResponse,
} from './apiClient';
import { TotpEnrollDialog } from './TotpEnrollDialog';
import { TotpChallengeDialog } from './TotpChallengeDialog';
import { BackupCodesDialog } from './BackupCodesDialog';
import { getSupabase } from '../../lib/supabase';

type PendingAction = 'regenerate' | 'unenroll' | null;

/**
 * 2FA 設定區（PR 7）
 *
 * 視覺狀態：
 *  - 載入中：spinner
 *  - 未啟用：顯示「啟用 2FA」按鈕（admin/moderator 額外顯示警告）
 *  - 已啟用：顯示啟用時間 + 備援碼剩餘 + 「重新產生備援碼」/「停用 2FA」按鈕
 *    -- 後兩者要求 aal2，session 是 aal1 時會先彈 challenge dialog
 */
export function TwoFactorSection() {
    const { t } = useTranslation('account');
    const { isLoggedIn, profile } = useAuthContext();
    const [status, setStatus] = useState<TotpStatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [enrollOpen, setEnrollOpen] = useState(false);
    const [challengeOpen, setChallengeOpen] = useState(false);
    const [pending, setPending] = useState<PendingAction>(null);
    const [busy, setBusy] = useState(false);

    const [backupCodesOpen, setBackupCodesOpen] = useState(false);
    const [backupCodes, setBackupCodes] = useState<string[]>([]);

    const reload = useCallback(async () => {
        if (!isLoggedIn) return;
        setLoading(true);
        setError('');
        try {
            const data = await fetchTotpStatus();
            setStatus(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'failed');
        } finally {
            setLoading(false);
        }
    }, [isLoggedIn]);

    useEffect(() => { reload(); }, [reload]);

    const isAal2 = status?.currentAal === 'aal2';

    // 啟用流程：enroll dialog → enrolled callback → 自動產備援碼 → 顯示
    const handleEnrolled = async () => {
        try {
            const res = await generateBackupCodes();
            if (res.success) {
                setBackupCodes(res.codes);
                setBackupCodesOpen(true);
            }
        } catch (e) {
            // 備援碼產生失敗不致命 — TOTP 已啟用，user 之後可在頁面再產一次
            setError(e instanceof Error ? e.message : 'backup_codes_failed');
        }
        setEnrollOpen(false);
        await reload();
    };

    // 重新產生備援碼 — 必須 aal2
    const handleRegenerate = async () => {
        if (!isAal2) {
            setPending('regenerate');
            setChallengeOpen(true);
            return;
        }
        setBusy(true);
        try {
            const res = await generateBackupCodes();
            if (res.success) {
                setBackupCodes(res.codes);
                setBackupCodesOpen(true);
            }
        } catch (e) {
            if (e instanceof ApiError && e.status === 403) {
                // session 顯示 aal2 但 server 端驗證失敗 — 強制再驗一次
                setPending('regenerate');
                setChallengeOpen(true);
            } else {
                setError(e instanceof Error ? e.message : 'failed');
            }
        } finally {
            setBusy(false);
            await reload();
        }
    };

    // 停用 2FA — 必須 aal2，刪所有 verified TOTP factors + 清備援碼
    const handleUnenroll = async () => {
        if (!isAal2) {
            setPending('unenroll');
            setChallengeOpen(true);
            return;
        }
        if (!confirm(t('mfa.unenroll.confirm', '確定要停用 2FA？'))) return;
        setBusy(true);
        try {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase not available');

            const { data: factors } = await supabase.auth.mfa.listFactors();
            const targets = (factors?.totp || []).concat(
                (factors?.all || []).filter(f => f.factor_type === 'totp' && !(factors?.totp || []).find(tf => tf.id === f.id)),
            );
            for (const f of targets) {
                await supabase.auth.mfa.unenroll({ factorId: f.id });
            }
            // 備援碼：unenroll 後 enrolled=false，重新 enroll 時 generateBackupCodes 會
            // upsert 覆蓋。留著的 hash 對沒有 factor 的 user 無實際安全風險（攻擊者
            // 即使猜中 backup code，totp-recover 也只會 unenroll 不存在的 factors，
            // 不會給 aal2 升級），故不額外打 API 清除。
        } catch (e) {
            setError(e instanceof Error ? e.message : t('mfa.unenroll.error', '停用失敗'));
        } finally {
            setBusy(false);
            await reload();
        }
    };

    const handleChallengeSuccess = async () => {
        await reload(); // 拿新 aal2 token 後狀態
        if (pending === 'regenerate') await handleRegenerate();
        if (pending === 'unenroll') await handleUnenroll();
        setPending(null);
    };

    if (!isLoggedIn) return null;

    return (
        <section className="rounded-xl border border-white/10 bg-card/50 p-5 space-y-4">
            <header className="flex items-start gap-3">
                {status?.enrolled
                    ? <ShieldCheck className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                    : <Shield className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                }
                <div className="flex-1">
                    <h2 className="text-lg font-semibold">{t('mfa.title', '兩步驟驗證 (2FA)')}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t('mfa.description', '啟用後登入需額外輸入 6 位數驗證碼。')}
                    </p>
                </div>
                {status && (
                    <span className={`text-xs px-2 py-0.5 rounded ${status.enrolled
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                        {status.enrolled ? t('mfa.statusOn', '已啟用') : t('mfa.statusOff', '尚未啟用')}
                    </span>
                )}
            </header>

            {loading && (
                <div className="flex justify-center py-3">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            )}

            {!loading && status && !status.enrolled && status.requiredByTrustLevel && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-500 flex items-start gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{t('mfa.adminRequired', '⚠️ 帳號等級需 2FA', { level: status.trustLevel })}</span>
                </div>
            )}

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    {error}
                </div>
            )}

            {!loading && status && !status.enrolled && (
                <div className="flex justify-end">
                    <Button onClick={() => setEnrollOpen(true)} className="gap-2">
                        <Shield className="w-4 h-4" />
                        {t('mfa.enroll.button', '啟用 2FA')}
                    </Button>
                </div>
            )}

            {!loading && status && status.enrolled && (
                <>
                    {status.enrolledAt && (
                        <p className="text-xs text-muted-foreground">
                            {t('mfa.enrolledAt', '啟用時間')}：{new Date(status.enrolledAt).toLocaleString()}
                        </p>
                    )}

                    <div className="rounded-md border border-white/10 bg-background/30 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <KeyRound className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{t('mfa.backup.title', '備援碼')}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {t('mfa.backup.remaining', '剩餘 {{count}} 組', { count: status.backupCodesRemaining })}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{t('mfa.backup.desc', '遺失驗證器時可用備援碼恢復登入。每組僅能使用一次。')}</p>
                        <div className="flex justify-end">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (status.backupCodesRemaining > 0
                                        && !confirm(t('mfa.backup.regenConfirm', '舊的備援碼將立刻作廢'))) return;
                                    handleRegenerate();
                                }}
                                disabled={busy}
                                className="gap-2"
                            >
                                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                {t('mfa.backup.regenerate', '重新產生備援碼')}
                            </Button>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleUnenroll}
                            disabled={busy || !!profile && (profile.trust_level === 'admin' || profile.trust_level === 'moderator')}
                            className="gap-2 text-destructive hover:text-destructive"
                            title={profile && (profile.trust_level === 'admin' || profile.trust_level === 'moderator')
                                ? t('mfa.adminRequired', '帳號等級需 2FA', { level: profile.trust_level })
                                : undefined}
                        >
                            {t('mfa.unenroll.button', '停用 2FA')}
                        </Button>
                    </div>
                </>
            )}

            <TotpEnrollDialog
                open={enrollOpen}
                onClose={() => setEnrollOpen(false)}
                onEnrolled={handleEnrolled}
            />
            <TotpChallengeDialog
                open={challengeOpen}
                onClose={() => { setChallengeOpen(false); setPending(null); }}
                onSuccess={handleChallengeSuccess}
            />
            <BackupCodesDialog
                open={backupCodesOpen}
                codes={backupCodes}
                onDone={() => {
                    setBackupCodesOpen(false);
                    setBackupCodes([]);
                }}
            />
        </section>
    );
}
