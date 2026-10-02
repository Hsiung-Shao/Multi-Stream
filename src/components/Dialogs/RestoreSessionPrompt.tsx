// 短暫播放回復提示
//
// 啟動時若偵測到「10 分鐘內」上次有未關閉的串流,彈此提示讓使用者選擇:
//   - 恢復:還原上次的串流 / 布局 / 畫布位置
//   - 重新開始:維持清空的畫布
//
// 由 App.tsx 控制 open 與待恢復資料,本元件只負責 UI 與回呼。

import { useTranslation } from 'react-i18next';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';

interface RestoreSessionPromptProps {
    open: boolean;
    streamCount: number;
    onRestore: () => void;
    onDiscard: () => void;
}

export function RestoreSessionPrompt({ open, streamCount, onRestore, onDiscard }: RestoreSessionPromptProps) {
    const { t } = useTranslation('common');
    return (
        <AlertDialog open={open} onOpenChange={(v) => { if (!v) onDiscard(); }}>
            <AlertDialogContent className="bg-card border-border text-foreground">
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('restore_session.title')}</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        {t('restore_session.desc', { count: streamCount })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onDiscard}>{t('restore_session.restart')}</AlertDialogCancel>
                    <AlertDialogAction onClick={onRestore} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        {t('restore_session.restore')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export default RestoreSessionPrompt;
