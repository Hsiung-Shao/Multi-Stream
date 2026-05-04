import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { CloudUpload, CloudDownload, GitMerge, Loader2, AlertTriangle } from 'lucide-react';
import type { ConflictResolution } from './useCloudSync';
import type { DiffSummary } from './cloudSync';

interface CloudSyncConflictDialogProps {
    open: boolean;
    diff: DiffSummary | null;
    submitting: boolean;
    onResolve: (decision: ConflictResolution) => void;
    onClose: () => void;
}

/**
 * 雲端 / 本地收藏衝突解決 dialog
 *
 * 三選：
 * - keep_cloud：保留雲端、丟棄本地（拉雲端覆寫 localStorage）
 * - keep_local：保留本地、覆蓋雲端（delete cloud + push local）
 * - merge：合併（聯集；item 級 cloud 勝）
 */
export function CloudSyncConflictDialog({
    open,
    diff,
    submitting,
    onResolve,
    onClose,
}: CloudSyncConflictDialogProps) {
    const { t } = useTranslation('account');
    const [pendingDecision, setPendingDecision] = useState<ConflictResolution | null>(null);

    const handleClick = (decision: ConflictResolution) => {
        setPendingDecision(decision);
        onResolve(decision);
    };

    const summary = diff
        ? {
            local: diff.total.local,
            cloud: diff.total.cloud,
            conflict:
                diff.favorites.conflict + diff.categories.conflict + diff.tags.conflict,
        }
        : null;

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v && !submitting) onClose();
            }}
        >
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                        {t('cloudSync.conflict.title', '收藏雲端同步衝突')}
                    </DialogTitle>
                    <DialogDescription>
                        {t(
                            'cloudSync.conflict.description',
                            '雲端與本地都有資料且部分項目重疊。請選擇處理方式：',
                        )}
                    </DialogDescription>
                </DialogHeader>

                {summary && (
                    <div className="rounded-md border border-white/10 bg-card/50 p-3 text-xs space-y-1">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('cloudSync.local', '本地')}</span>
                            <span className="tabular-nums">{summary.local}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('cloudSync.cloud', '雲端')}</span>
                            <span className="tabular-nums">{summary.cloud}</span>
                        </div>
                        <div className="flex justify-between text-amber-400">
                            <span>{t('cloudSync.conflict.overlap', '重疊（衝突）項目')}</span>
                            <span className="tabular-nums">{summary.conflict}</span>
                        </div>
                    </div>
                )}

                <div className="space-y-2 mt-2">
                    <Button
                        variant="outline"
                        className="w-full justify-start gap-3 h-auto py-3"
                        disabled={submitting}
                        onClick={() => handleClick('merge')}
                    >
                        {submitting && pendingDecision === 'merge' ? (
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        ) : (
                            <GitMerge className="w-4 h-4 shrink-0 text-primary" />
                        )}
                        <div className="text-left">
                            <p className="text-sm font-medium">
                                {t('cloudSync.conflict.merge.label', '合併（推薦）')}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {t(
                                    'cloudSync.conflict.merge.desc',
                                    '保留雙方所有項目；重疊項目以雲端版本為準',
                                )}
                            </p>
                        </div>
                    </Button>

                    <Button
                        variant="outline"
                        className="w-full justify-start gap-3 h-auto py-3"
                        disabled={submitting}
                        onClick={() => handleClick('keep_cloud')}
                    >
                        {submitting && pendingDecision === 'keep_cloud' ? (
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        ) : (
                            <CloudDownload className="w-4 h-4 shrink-0 text-blue-400" />
                        )}
                        <div className="text-left">
                            <p className="text-sm font-medium">
                                {t('cloudSync.conflict.keepCloud.label', '保留雲端，覆蓋本地')}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {t(
                                    'cloudSync.conflict.keepCloud.desc',
                                    '本地未上傳的資料將遺失',
                                )}
                            </p>
                        </div>
                    </Button>

                    <Button
                        variant="outline"
                        className="w-full justify-start gap-3 h-auto py-3"
                        disabled={submitting}
                        onClick={() => handleClick('keep_local')}
                    >
                        {submitting && pendingDecision === 'keep_local' ? (
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        ) : (
                            <CloudUpload className="w-4 h-4 shrink-0 text-emerald-400" />
                        )}
                        <div className="text-left">
                            <p className="text-sm font-medium">
                                {t('cloudSync.conflict.keepLocal.label', '保留本地，覆蓋雲端')}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {t(
                                    'cloudSync.conflict.keepLocal.desc',
                                    '雲端其他裝置上傳的資料將遺失',
                                )}
                            </p>
                        </div>
                    </Button>
                </div>

                <DialogFooter>
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                        {t('common:cancel', '稍後再說')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
