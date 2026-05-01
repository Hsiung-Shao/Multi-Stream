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
import { Loader2, AlertTriangle } from 'lucide-react';
import type { UserIdentity } from '@supabase/supabase-js';

interface UnlinkConfirmDialogProps {
    open: boolean;
    identity: UserIdentity | null;
    remainingCount: number; // 解除後剩幾個 identity
    submitting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * 解除 OAuth 連結前的二次確認
 *
 * - remainingCount > 0：純警告（其他 provider 仍可登入）
 * - remainingCount === 0：解除最後一個 = 刪帳號（呼叫端應改開 DeleteAccountDialog 而非此 dialog）
 */
export function UnlinkConfirmDialog({
    open,
    identity,
    remainingCount,
    submitting,
    onConfirm,
    onCancel,
}: UnlinkConfirmDialogProps) {
    const { t } = useTranslation('account');
    const providerLabel = identity?.provider
        ? identity.provider.charAt(0).toUpperCase() + identity.provider.slice(1)
        : '';

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) onCancel(); }}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                        {t('unlink.title', '解除連結')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('unlink.description',
                            `確定要解除 ${providerLabel} 嗎？解除後將無法用 ${providerLabel} 登入此帳號。`,
                            { provider: providerLabel })}
                    </DialogDescription>
                </DialogHeader>

                {remainingCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                        {t('unlink.remainingHint',
                            `解除後仍有 ${remainingCount} 個其他登入方式可使用。`,
                            { count: remainingCount })}
                    </p>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onCancel} disabled={submitting}>
                        {t('common:cancel', '取消')}
                    </Button>
                    <Button variant="destructive" onClick={onConfirm} disabled={submitting} className="gap-2">
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {t('unlink.confirm', '解除')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
