import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Cloud, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useCloudSync } from './useCloudSync';
import { CloudSyncConflictDialog } from './CloudSyncConflictDialog';

/**
 * 帳號設定頁的「收藏雲端同步」區塊
 *
 * 顯示同步狀態 + 上次同步時間 + 立即同步按鈕。
 * 衝突時自動彈出 CloudSyncConflictDialog 讓使用者選擇處理方式。
 */
export function CloudSyncSection() {
    const { t } = useTranslation('account');
    const { status, error, lastSyncAt, conflict, syncNow, resolveConflict, dismissConflict } = useCloudSync();

    const lastSyncDisplay = lastSyncAt
        ? new Date(lastSyncAt).toLocaleString('zh-TW', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
        : t('cloudSync.never', '尚未同步');

    const isSyncing = status === 'pulling' || status === 'pushing';

    const statusBadge = () => {
        if (isSyncing) {
            return (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {status === 'pulling' ? t('cloudSync.pulling', '下載中') : t('cloudSync.pushing', '上傳中')}
                </span>
            );
        }
        if (status === 'success') {
            return (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                    <CheckCircle2 className="w-3 h-3" />
                    {t('cloudSync.success', '已同步')}
                </span>
            );
        }
        if (status === 'error') {
            return (
                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="w-3 h-3" />
                    {t('cloudSync.error', '同步失敗')}
                </span>
            );
        }
        if (status === 'conflict') {
            return (
                <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                    <AlertTriangle className="w-3 h-3" />
                    {t('cloudSync.conflictBadge', '需處理衝突')}
                </span>
            );
        }
        return null;
    };

    return (
        <section className="rounded-xl border border-white/10 bg-card/50 p-5 space-y-4">
            <header>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-blue-400" />
                    {t('cloudSync.title', '收藏雲端同步')}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                    {t(
                        'cloudSync.description',
                        '登入時自動同步收藏、分類、標籤到雲端。其他裝置登入此帳號時會自動拉取。',
                    )}
                </p>
            </header>

            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                        {t('cloudSync.lastSync', '上次同步')}：
                        <span className="text-foreground ml-1">{lastSyncDisplay}</span>
                    </span>
                    {statusBadge()}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncNow()}
                    disabled={isSyncing}
                    className="gap-2"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    {t('cloudSync.syncNow', '立即同步')}
                </Button>
            </div>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    {error}
                </div>
            )}

            <CloudSyncConflictDialog
                open={status === 'conflict' && !!conflict}
                diff={conflict?.diff ?? null}
                submitting={status === 'pushing' || status === 'pulling'}
                onResolve={resolveConflict}
                onClose={dismissConflict}
            />
        </section>
    );
}
