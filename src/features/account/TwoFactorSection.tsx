import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Loader2, Shield, ShieldCheck, KeyRound } from 'lucide-react';
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
import { ConfirmDialog } from './ConfirmDialog';
import { getSupabase } from '../../lib/supabase';

type PendingAction = 'regenerate' | 'unenroll' | null;
type ConfirmKind = 'regenerate' | 'unenroll' | null;

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
    const { isLoggedIn } = useAuthContext();
    const [status, setStatus] = useState<TotpStatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [enrollOpen, setEnrollOpen] = useState(false);
    const [challengeOpen, setChallengeOpen] = useState(false);
    const [pending, setPending] = useState<PendingAction>(null);
    const [busy, setBusy] = useState(false);

    const [backupCodesOpen, setBackupCodesOpen] = useState(false);
    const [backupCodes, setBackupCodes] = useState<string[]>([]);

    // 二次確認 dialog（取代 window.confirm）— 確認後跳實際操作流程
    const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);

    const reload = useCallback(async () => {
        if (!isLoggedIn) return;
        // 第一次載入才顯示 spinner；之後 refresh 不要把 UI blank 成 spinner
        // （這正是 user 看到的「section 只剩一個圓圈卡住」現象）
        setStatus(prev => {
            if (prev === null) setLoading(true);
            return prev;
        });
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
            // 備援碼產生失敗不致命 — TOTP 已啟用、user 之後可手動「重新產生備援碼」
            // 給明確指引取代 raw error key
            const isAal2Issue = e instanceof ApiError && e.status === 403;
            setError(isAal2Issue
                ? '2FA 已啟用，但備援碼產生失敗（session 同步問題）。請點下方「重新產生備援碼」。'
                : '2FA 已啟用，但備援碼產生失敗，請點下方「重新產生備援碼」。');
        }
        setEnrollOpen(false);
        await reload();
    };

    // 真正執行：產備援碼。**不檢查** isAal2，呼叫端負責確保已升級。
    const performRegenerate = async () => {
        setBusy(true);
        try {
            const res = await generateBackupCodes();
            if (res.success) {
                setBackupCodes(res.codes);
                setBackupCodesOpen(true);
            }
        } catch (e) {
            // 仍然拒絕表示 server 端 aal 沒升級成功 — 顯示錯誤而非再彈 challenge
            // （之前死循環的成因：失敗時又開 challenge → 又跑這 → ...）
            const msg = e instanceof Error ? e.message : 'failed';
            setError(e instanceof ApiError && e.status === 403
                ? '驗證未升級至 aal2，請重新登入後重試'
                : msg);
        } finally {
            setBusy(false);
            await reload();
        }
    };

    // 真正執行：停用 2FA。同樣不檢查 isAal2。
    const performUnenroll = async () => {
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
        } catch (e) {
            setError(e instanceof Error ? e.message : t('mfa.unenroll.error', '停用失敗'));
        } finally {
            setBusy(false);
            await reload();
        }
    };

    // 點按鈕：先彈 ConfirmDialog 取代 window.confirm；user 確認後再決定走 aal2 直接路或先 challenge。
    const requestRegenerate = () => setConfirmKind('regenerate');
    const requestUnenroll = () => setConfirmKind('unenroll');

    // ConfirmDialog 按下「確認」之後實際分流
    const onConfirmed = async () => {
        const kind = confirmKind;
        setConfirmKind(null);
        if (kind === 'regenerate') {
            if (!isAal2) {
                setPending('regenerate');
                setChallengeOpen(true);
                return;
            }
            await performRegenerate();
        } else if (kind === 'unenroll') {
            if (!isAal2) {
                setPending('unenroll');
                setChallengeOpen(true);
                return;
            }
            await performUnenroll();
        }
    };

    // ChallengeDialog 成功後 — verify 已把 session 升 aal2，直接呼叫 perform*，
    // 不要回呼 handleRegenerate/handleUnenroll（它們檢查的 isAal2 在 closure 內仍是
    // 舊值，會再彈 challenge dialog → 死循環）。
    // 不重複 confirm — 走過 challenge dialog = 已確認意圖。
    const handleChallengeSuccess = async () => {
        const what = pending;
        setPending(null);
        if (what === 'regenerate') {
            await performRegenerate();
        } else if (what === 'unenroll') {
            await performUnenroll();
        } else {
            await reload();
        }
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

            {!loading && status && !status.enrolled && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-500/90 flex items-start gap-1">
                    <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{t('mfa.recommendation', '建議啟用以提升帳號安全（選用功能）')}</span>
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
                                onClick={requestRegenerate}
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
                            onClick={requestUnenroll}
                            disabled={busy}
                            className="gap-2 text-destructive hover:text-destructive"
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
            <ConfirmDialog
                open={confirmKind === 'unenroll'}
                onClose={() => setConfirmKind(null)}
                onConfirm={onConfirmed}
                variant="destructive"
                title={t('mfa.unenroll.title', '停用兩步驟驗證')}
                description={t('mfa.unenroll.confirm', '確定要停用 2FA？停用後備援碼也會作廢。')}
                confirmLabel={t('mfa.unenroll.button', '停用 2FA')}
            />
            <ConfirmDialog
                open={confirmKind === 'regenerate'}
                onClose={() => setConfirmKind(null)}
                onConfirm={onConfirmed}
                title={t('mfa.backup.regenerate', '重新產生備援碼')}
                description={(status?.backupCodesRemaining ?? 0) > 0
                    ? t('mfa.backup.regenConfirm', '舊的備援碼將立刻作廢，確定要重新產生嗎？')
                    : t('mfa.backup.regenFirstTime', '將為你產生 8 組新的備援碼，請妥善保存。')
                }
                confirmLabel={t('mfa.backup.regenerate', '重新產生備援碼')}
            />
        </section>
    );
}
