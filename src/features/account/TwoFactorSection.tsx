import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Loader2, Shield, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';
import {
    fetchTotpStatus,
    generateBackupCodes,
    submitTotpUnenroll,
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

    // 自動補拿備援碼：enroll 流程（不論 happy path 或 timeout path）統一設
    // sessionStorage flag。status reload 後 enrolled=true + 0 codes + flag=pending
    // → 此 effect 觸發 refreshSession + generateBackupCodes。也支援 user 重整後重進。
    //
    // 為何 3 次 backoff：mfa.verify 後 supabase-js 內部 _saveSession 與 token cache 同步
    // 在 Cloudflare Access / 慢網路下需數秒。1 次 retry 不夠，3 次（0/2s/5s）涵蓋大多數
    // 觀察到的情境。每次嘗試前都主動 refreshSession 強制拉新 access_token。
    //
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
            const supabase = await getSupabase();
            const backoffMs = [0, 2000, 5000];
            let lastWasAal2Issue = false;

            for (const wait of backoffMs) {
                if (cancelled) return;
                if (wait > 0) await new Promise(r => setTimeout(r, wait));
                if (cancelled) return;

                // 每次 attempt 都主動 refreshSession 強拉新 aal2 token
                if (supabase) {
                    await Promise.race([
                        supabase.auth.refreshSession(),
                        new Promise(r => setTimeout(r, 3000)),
                    ]).catch(() => undefined);
                }
                if (cancelled) return;

                try {
                    const res = await generateBackupCodes();
                    if (res.success) {
                        setBackupCodes(res.codes);
                        setBackupCodesOpen(true);
                        setError('');
                        await reload();
                        return;
                    }
                    // success=false 但無 throw — 視為非 aal2 類錯誤，直接放棄
                    setError('備援碼自動產生失敗，請點下方「重新產生備援碼」手動產生');
                    return;
                } catch (e) {
                    if (e instanceof ApiError && e.status === 403) {
                        // aal2 還沒同步 — 進下一輪 backoff
                        lastWasAal2Issue = true;
                        continue;
                    }
                    // 非 403 錯誤（5xx/network）— 直接放棄，不再 retry
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
    }, [status, reload]);

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
        // 進入 unenroll 流程前先清掉 flag，避免雙 dialog 衝突。
        try { sessionStorage.removeItem('mfa_pending_backup_codes'); } catch { /* ignore */ }

        // 主動 refreshSession backoff：ChallengeDialog timeout 後 client token cache 可能
        // 還沒升 aal2（supabase-js 內部 _saveSession 仍在處理）。在進入 unenroll 之前先
        // 強制 refresh 拉新 access_token（gotrue 看到 user 已 verified TOTP → 回 aal2 token）。
        // 兩次 backoff 0/2s，每次給 refresh 5s 完成；總計 ≤7s。
        try {
            const sb = await getSupabase();
            if (sb) {
                for (const wait of [0, 2000]) {
                    if (wait > 0) await new Promise(r => setTimeout(r, wait));
                    await Promise.race([
                        sb.auth.refreshSession(),
                        new Promise(r => setTimeout(r, 5000)),
                    ]).catch(() => undefined);
                    // 檢查是否已 aal2，若是則提前跳出（不必跑滿）
                    try {
                        const { data } = await sb.auth.getSession();
                        const token = data?.session?.access_token;
                        if (token) {
                            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                            if (payload?.aal === 'aal2') break;
                        }
                    } catch { /* ignore */ }
                }
            }
        } catch { /* ignore — 後續 step 2/3 會自己處理失敗 */ }

        try {
            // Step 1：嘗試 client SDK 路徑
            try {
                const supabase = await getSupabase();
                if (supabase) {
                    const factorsResult = await withTimeout(
                        supabase.auth.mfa.listFactors(),
                        5000,
                        'listFactors',
                    ).catch(() => null);
                    const factorsData = factorsResult?.data;
                    if (factorsData) {
                        // 同時從 totp 與 all 收集 totp factor 並去重
                        // （listFactors 結構：totp 是專屬陣列、all 含所有類型）
                        const seen = new Set<string>();
                        const targetIds: string[] = [];
                        for (const f of (factorsData.totp ?? [])) {
                            if (!seen.has(f.id)) { seen.add(f.id); targetIds.push(f.id); }
                        }
                        for (const f of (factorsData.all ?? [])) {
                            if (f.factor_type !== 'totp') continue;
                            if (!seen.has(f.id)) { seen.add(f.id); targetIds.push(f.id); }
                        }
                        for (const factorId of targetIds) {
                            await withTimeout(
                                supabase.auth.mfa.unenroll({ factorId }),
                                5000,
                                'unenroll',
                            ).catch(() => undefined);
                        }
                    }
                }
            } catch { /* client SDK 任何錯誤都進 server fallback */ }

            // Step 2：查 server 真實狀態
            let stillEnrolled = true;
            try {
                const updated = await fetchTotpStatus();
                setStatus(updated);
                stillEnrolled = updated.enrolled;
            } catch {
                // 查不到狀態 → 假設仍 enrolled，走 fallback 試試
                stillEnrolled = true;
            }

            if (!stillEnrolled) {
                setError('');
                return;
            }

            // Step 3：server-side fallback（service_role 直接 RPC 刪 factor）
            try {
                await submitTotpUnenroll();
            } catch (e) {
                if (e instanceof ApiError && e.status === 403) {
                    setError('驗證未升級至 aal2，請重新登入後再試');
                } else if (e instanceof ApiError && e.status === 401) {
                    setError('登入已逾期，請重新登入');
                } else {
                    setError(e instanceof Error ? e.message : t('mfa.unenroll.error', '停用失敗'));
                }
                return;
            }

            // Step 4：再查一次確認 server 已停用
            try {
                const recheck = await fetchTotpStatus();
                setStatus(recheck);
                if (!recheck.enrolled) {
                    setError('');
                    return;
                }
                setError(t('mfa.unenroll.error', '停用失敗，請重新整理頁面後再試'));
            } catch {
                setError(t('mfa.unenroll.error', '停用失敗，請重新整理頁面後再試'));
            }
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
                // dialog 任何方式關閉（成功/取消/timeout）都觸發 reload，讓 useEffect
                // 看到最新 status.enrolled=true + sessionStorage flag → 補拿備援碼
                onClose={() => { setEnrollOpen(false); reload(); }}
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
