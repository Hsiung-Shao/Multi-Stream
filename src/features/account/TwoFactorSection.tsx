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

// 給 supabase mfa SDK 加 timeout — 避免 client promise 不返回造成 spinner 死循環
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timeout`)), ms),
        ),
    ]);
}

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

    // 自動補拿備援碼：當 enroll 走 timeout 路徑（TotpEnrollDialog 會設 sessionStorage
    // flag），主畫面 status reload 後 enrolled=true + 0 codes + flag=pending → 自動觸發
    // refreshSession + generateBackupCodes。也支援 user 重整後進來自動觸發。
    // 不需 useRef 防多觸發 — sessionStorage flag 用「先消耗、再執行」確保 idempotent
    useEffect(() => {
        if (!status?.enrolled) return;
        if (status.backupCodesRemaining > 0) return;
        let flag: string | null = null;
        try { flag = sessionStorage.getItem('mfa_pending_backup_codes'); } catch { /* ignore */ }
        if (flag !== 'pending') return;

        try { sessionStorage.removeItem('mfa_pending_backup_codes'); } catch { /* ignore */ }

        (async () => {
            // 主動 refresh 拿新 aal2 token（verify timeout 後 client cache 可能還沒同步）
            try {
                const supabase = await getSupabase();
                if (supabase) {
                    await Promise.race([
                        supabase.auth.refreshSession(),
                        new Promise(r => setTimeout(r, 3000)),
                    ]).catch(() => undefined);
                }
            } catch { /* ignore */ }

            try {
                const res = await generateBackupCodes();
                if (res.success) {
                    setBackupCodes(res.codes);
                    setBackupCodesOpen(true);
                    setError('');
                    await reload();
                    return;
                }
                setError('備援碼自動產生失敗，請點下方「重新產生備援碼」手動產生');
            } catch (e) {
                const isAal2Issue = e instanceof ApiError && e.status === 403;
                setError(isAal2Issue
                    ? '2FA session 未升級，請點下方「重新產生備援碼」手動產生'
                    : '備援碼自動產生失敗，請點下方「重新產生備援碼」手動產生');
            }
        })();
    }, [status, reload]);

    const isAal2 = status?.currentAal === 'aal2';

    // 啟用流程：enroll dialog → enrolled callback → 自動產備援碼 → 顯示
    // verify 後 client token 不一定立刻同步到 aal2 — 給一次 retry 機會
    // （observed in production：第一次 generateBackupCodes 用舊 aal1 token 拿到 403，
    //  refreshSession + 等 1.5s + 重試會成功）
    const handleEnrolled = async () => {
        const tryGenerate = async (): Promise<{ success: boolean; codes: string[] } | null> => {
            try {
                return await generateBackupCodes();
            } catch (e) {
                if (e instanceof ApiError && e.status === 403) return null; // aal2 還沒同步，retry
                throw e;
            }
        };

        let result: { success: boolean; codes: string[] } | null = null;
        let lastError: unknown = null;
        try {
            result = await tryGenerate();
            if (!result) {
                // 第一次 403 — refresh session + 等待 + retry
                try {
                    const supabase = await getSupabase();
                    if (supabase) {
                        await Promise.race([
                            supabase.auth.refreshSession(),
                            new Promise(r => setTimeout(r, 2000)),
                        ]).catch(() => undefined);
                    }
                } catch { /* ignore */ }
                await new Promise(r => setTimeout(r, 1500));
                result = await tryGenerate();
            }
        } catch (e) {
            lastError = e;
        }

        if (result?.success) {
            setBackupCodes(result.codes);
            setBackupCodesOpen(true);
        } else {
            const isAal2Issue = lastError instanceof ApiError && lastError.status === 403;
            const msg = isAal2Issue || result === null
                ? '2FA 已啟用，但備援碼產生失敗（session 同步問題）。請點下方「重新產生備援碼」。'
                : '2FA 已啟用，但備援碼產生失敗，請點下方「重新產生備援碼」。';
            setError(msg);
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
    // listFactors / unenroll 各加 5s timeout 防 SDK hang；最後查 server 真實狀態決定 error
    const performUnenroll = async () => {
        setBusy(true);
        let timeoutHappened = false;
        let exceptionMsg: string | null = null;
        try {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase not available');

            const factorsResult = await withTimeout(
                supabase.auth.mfa.listFactors(),
                5000,
                'listFactors',
            ).catch(() => null);
            const factorsData = factorsResult?.data;
            let attemptedCount = 0;
            let timeoutCount = 0;
            if (factorsData) {
                const targets = (factorsData.totp || []).concat(
                    (factorsData.all || []).filter(f =>
                        f.factor_type === 'totp'
                        && !(factorsData.totp || []).find(tf => tf.id === f.id),
                    ),
                );
                for (const f of targets) {
                    attemptedCount++;
                    try {
                        await withTimeout(
                            supabase.auth.mfa.unenroll({ factorId: f.id }),
                            5000,
                            'unenroll',
                        );
                    } catch {
                        timeoutCount++;
                    }
                }
            }
            if (attemptedCount > 0 && timeoutCount === attemptedCount) {
                timeoutHappened = true;
            }
        } catch (e) {
            exceptionMsg = e instanceof Error ? e.message : t('mfa.unenroll.error', '停用失敗');
        }
        setBusy(false);

        // 不依賴 client SDK 是否 timeout — 直接查 server 真實狀態。
        // server 端 enrolled=false → 就算 client SDK timeout 也算成功（不顯示 error）
        try {
            const updated = await fetchTotpStatus();
            setStatus(updated);
            if (!updated.enrolled) {
                setError('');
                return;
            }
        } catch { /* fetchTotpStatus 失敗時 fall through 顯示 error */ }

        // server 還是 enrolled=true 才算真失敗
        if (exceptionMsg) setError(exceptionMsg);
        else if (timeoutHappened) setError('停用網路逾時，請重新整理頁面確認狀態');
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
            // 「停用 2FA」是高敏感操作 — 一律強制重新驗證 TOTP，不信任 session aal2 grace
            // （避免「剛 enroll 完還在 aal2 視窗、攻擊者偷走電腦立刻停用」場景）
            setPending('unenroll');
            setChallengeOpen(true);
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
