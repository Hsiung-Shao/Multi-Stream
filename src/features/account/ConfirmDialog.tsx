import { useTranslation } from 'react-i18next';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** 'destructive'：紅色強調危險操作（停用 2FA、刪除等）；'default'：中性 */
    variant?: 'destructive' | 'default';
    onConfirm: () => void;
    onClose: () => void;
}

/**
 * 取代 window.confirm 的 Dialog 二次確認元件。
 *
 * 為什麼自己寫而非用 confirm()：
 * - confirm() 在手機端 / 嵌入式環境 (Cloudflare Access SSO 包住的 preview) 行為不一致
 * - confirm() 阻塞 JS 執行緒、無法套樣式、無法翻譯
 * - 本元件用同樣的 Dialog 系統與其他 dialog 視覺一致
 */
export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    variant = 'default',
    onConfirm,
    onClose,
}: Props) {
    const { t } = useTranslation('account');
    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className={variant === 'destructive' ? 'flex items-center gap-2 text-destructive' : ''}>
                        {variant === 'destructive' && <AlertTriangle className="w-5 h-5" />}
                        {title}
                    </DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>
                        {cancelLabel || t('mfa.enroll.cancel', '取消')}
                    </Button>
                    <Button
                        variant={variant === 'destructive' ? 'destructive' : 'default'}
                        onClick={() => { onConfirm(); onClose(); }}
                    >
                        {confirmLabel || t('mfa.unenroll.confirm', '確認')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
