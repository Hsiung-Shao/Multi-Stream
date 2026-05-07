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
import { manualRefreshSession } from '../../lib/supabase';

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

    // 自動補拿備援碼：enroll 流程（不論 happy path 或 timeout path）統一設
    // sessionStorage flag。status reload 後 enrolled=true + 0 codes + flag=pending
    // → 此 effect 觸發補拿備援碼。也支援 user 重整後重進。
    //
    // 用 manualRefreshSession + raw fetch 完全繞過 supabase-js（mfa.verify 後 mutex
    // 可能卡死，supabase.auth.* 與 apiClient.generateBackupCodes 都會卡）。
    //
    // 3 次 backoff (0/2s/5s) 涵蓋大多數 token 同步延遲場景；
    // flag 在 effect 進入後立刻消耗（idempotent）— 失敗才 setError 提示手動重新產生。
    useEffect(() => {
        if (!status?.enrolled) return;
        if (status.backupCodesRemaining > 0) return;
        let flag: string | null = null;
        try { flag = sessionStorage.getItem('mfa_pending_backup_codes'); } catch { /* ignore */ }
        if (flag !== 'pending') return;

        try { sessionStorage.removeItem('mfa_pending_backup_codes'); } catch { /* ignore */ }

        let cancelled = false;
        (async () => {
            const backoffMs = [0, 2000, 5000];
            let lastWasAal2Issue = false;

            for (const wait of backoffMs) {
                if (cancelled) return;
                if (wait > 0) await new Promise(r => setTimeout(r, wait));
                if (cancelled) return;

                // 用 raw fetch refresh_token grant 拿新 aal2 token（繞過 supabase-js mutex）
                const refreshed = await manualRefreshSession();
                if (cancelled) return;
                if (!refreshed?.access_token) {
                    setError('登入狀態異常，請點下方「重新產生備援碼」手動產生');
                    return;
                }

                try {
                    const res = await fetch('/api/account/totp-backup-codes', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${refreshed.access_token}`,
                        },
                        body: '{}',
                    });
                    if (cancelled) return;

                    if (res.ok) {
                        const data = await res.json().catch(() => ({}));
                        if (data?.success && Array.isArray(data?.codes)) {
                            setBackupCodes(data.codes);
                            setBackupCodesOpen(true);
                            setError('');
                            // 用同一 aal2 token 確認最新 status（避開卡 mutex 的 apiClient）
                            try {
                                const statusRes = await fetch('/api/account/totp-status', {
                                    headers: { 'Authorization': `Bearer ${refreshed.access_token}` },
                                });
                                if (statusRes.ok) {
                                    const statusData = await statusRes.json();
                                    setStatus(statusData);
                                }
                            } catch { /* ignore */ }
                            return;
                        }
                        setError('備援碼自動產生失敗，請點下方「重新產生備援碼」手動產生');
                        return;
                    }
                    if (res.status === 403) {
                        // aal2 還沒同步 → 進下一輪 backoff（gotrue 內部 token 升級延遲）
                        lastWasAal2Issue = true;
                        continue;
                    }
                    // 其他 status → 直接放棄
                    setError('備援碼自動產生失敗，請點下方「重新產生備援碼」手動產生');
                    return;
                } catch {
                    setError('備援碼自動產生失敗，請點下方「重新產生備援碼」手動產生');
                    return;
                }
            }

            // 3 次都失敗
            setError(lastWasAal2Issue
                ? '2FA session 未升級，請點下方「重新產生備援碼」手動產生'
                : '備援碼自動產生失敗，請點下方「重新產生備援碼」手動產生');
        })();

        return () => { cancelled = true; };
    }, [status]);

    const isAal2 = status?.currentAal === 'aal2';

    // handleEnrolled 保留以維持 onEnrolled prop 介面相容性（雖然 TotpEnrollDialog
    // 已不再呼叫它）。實際備援碼補拿走 sessionStorage flag + 上方 useEffect 路徑。
    const handleEnrolled = async () => {
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

    // 真正執行：停用 2FA。呼叫端負責確保已 aal2（走過 ChallengeDialog）。
    //
    // 兩段式設計：
    //   1. 嘗試 client SDK listFactors + unenroll（5s timeout 防 hang）
    //   2. 查 server 真實狀態：仍 enrolled → fallback /api/account/totp-unenroll
    //      （用 service_role 直接 RPC 刪 factor，繞過 client token 同步 race）
    //
    // 為何需要 server fallback：mfa.verify 後 supabase-js 內部 token cache 同步
    // 在 Cloudflare Access / 慢網路下偶有延遲，導致 listFactors 拉到 stale data 或
    // unenroll 用 aal1 token 被 gotrue 拒絕。此時 client SDK 路徑會默默失敗，server
    // fallback 是「停用按鈕本身可靠」的保證。
    const performUnenroll = async () => {
        setBusy(true);
        // 防呆：若先前 enroll timeout 留下 mfa_pending_backup_codes flag 還沒被消耗，
        // 此時 user 直接按停用 → unenroll 失敗時 useEffect 會誤觸發補拿備援碼。
        try { sessionStorage.removeItem('mfa_pending_backup_codes'); } catch { /* ignore */ }

        // 設計：完全繞過 supabase-js client SDK
        //
        // 觀察：mfa.verify 在 Cloudflare Access 環境下偶爾 hang 在 supabase-js 內部
        // _saveSession（fetch 200 OK 但 promise 不 resolve）→ auth lock/mutex 不釋放
        // → 後續所有 supabase.auth.* 操作（refreshSession/listFactors/unenroll/getSession）
        // 都被卡住。listFactors+mfa.unenroll 與 getAuthHeader (apiClient) 都會 hang。
        //
        // 對策：用 manualRefreshSession（raw fetch /auth/v1/token grant_type=refresh_token）
        // 直接拿新 aal2 access_token，再用此 token 直接 fetch 打 /api/account/totp-unenroll
        // server endpoint。完全不依賴 supabase-js auth 的 internal mutex。
        try {
            // Step 1：手動 refresh 拿新的 aal2 token（gotrue 看到 user 已 verified TOTP，
            // refresh_token grant 會回新的 aal2 access_token）
            const refreshed = await manualRefreshSession();
            if (!refreshed?.access_token) {
                setError('登入狀態異常，請重新登入後再試');
                return;
            }

            // Step 2：用 aal2 token 直接 fetch 打 server endpoint
            const res = await fetch('/api/account/totp-unenroll', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${refreshed.access_token}`,
                },
                body: '{}',
            });
            if (!res.ok) {
                if (res.status === 403) setError('驗證未升級至 aal2，請重新登入後再試');
                else if (res.status === 401) setError('登入已逾期，請重新登入');
                else setError(t('mfa.unenroll.error', '停用失敗，請重新整理頁面後再試'));
                return;
            }

            // Step 3：用同一個 aal2 token 確認 server 真實狀態
            // （避開 apiClient.fetchTotpStatus，該 path 也透過 supabase-js getSession，
            // 可能受 mutex 影響）
            try {
                const statusRes = await fetch('/api/account/totp-status', {
                    headers: { 'Authorization': `Bearer ${refreshed.access_token}` },
                });
                if (statusRes.ok) {
                    const data = await statusRes.json();
                    setStatus(data);
                    if (!data.enrolled) {
                        setError('');
                        return;
                    }
                }
            } catch { /* status 查不到不致命 */ }
            // server endpoint 已回 200 視為成功（即使後續 status 查不到）
            setError('');
        } catch (e) {
            setError(e instanceof Error ? e.message : t('mfa.unenroll.error', '停用失敗'));
        } finally {
            setBusy(false);
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
                // dialog 任何方式關閉（成功/取消/timeout）都用 raw fetch 拉新 status：
                // enroll 剛完成那刻 supabase.auth.getSession 可能還沒 sync 到新 aal2，
                // apiClient.fetchTotpStatus 內部 getAuthHeader 拿到的 token 可能 stale，
                // 導致 reload 拉到舊 enrolled=false。改用 manualRefreshSession (raw refresh)
                // + Authorization Bearer raw fetch，繞過 supabase-js 確保拿到正確狀態。
                onClose={async () => {
                    setEnrollOpen(false);
                    let updated = false;
                    try {
                        const refreshed = await manualRefreshSession();
                        if (refreshed?.access_token) {
                            const res = await fetch('/api/account/totp-status', {
                                headers: { 'Authorization': `Bearer ${refreshed.access_token}` },
                            });
                            if (res.ok) {
                                const data = await res.json();
                                setStatus(data);
                                updated = true;
                            }
                        }
                    } catch { /* fallback */ }
                    if (!updated) await reload();
                }}
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
