// 短暫播放回復提示
//
// 啟動時若偵測到「10 分鐘內」上次有未關閉的串流,彈此提示讓使用者選擇:
//   - 恢復:還原上次的串流 / 布局 / 畫布位置
//   - 重新開始:維持清空的畫布
//
// 由 App.tsx 控制 open 與待恢復資料,本元件只負責 UI 與回呼。

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
    return (
        <AlertDialog open={open} onOpenChange={(v) => { if (!v) onDiscard(); }}>
            <AlertDialogContent className="bg-card border-border text-foreground">
                <AlertDialogHeader>
                    <AlertDialogTitle>恢復上次的觀看畫面?</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        偵測到你剛剛還有 {streamCount} 個正在觀看的串流(含布局與頻道位置)。要恢復嗎?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onDiscard}>重新開始</AlertDialogCancel>
                    <AlertDialogAction onClick={onRestore} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        恢復
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export default RestoreSessionPrompt;
