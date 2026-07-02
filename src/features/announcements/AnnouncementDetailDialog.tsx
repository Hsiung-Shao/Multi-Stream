/**
 * 公告詳情 Dialog(toast 點「查看詳情」後開啟)
 *
 * 長內文的完整閱讀介面:標題 + 系統公告小字 + 可捲動內文。
 * 前台與 admin 發布預覽共用同一份(1:1);preview 時呼叫端把
 * onDismissForever 傳 noop 即可(按鈕看得到但不寫 storage)。
 */

import { useTranslation } from 'react-i18next';
import { Megaphone } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import type { Announcement } from './types';

interface Props {
    announcement: Pick<Announcement, 'id' | 'title' | 'body'> | null;
    open: boolean;
    onClose: () => void;
    /** 按「不再顯示」時的副作用(前台寫 dismissed flag;預覽傳 noop) */
    onDismissForever?: () => void;
}

export function AnnouncementDetailDialog({ announcement, open, onClose, onDismissForever }: Props) {
    const { t } = useTranslation('announcements');

    if (!announcement) return null;

    const handleOpenChange = (next: boolean) => {
        if (!next) onClose();
    };

    const handleDismissForever = () => {
        onDismissForever?.();
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <div className="flex items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Megaphone className="size-4" />
                        </div>
                        <div className="min-w-0 space-y-1 text-left">
                            <DialogDescription className="text-[11px] uppercase tracking-wider">
                                {t('announcement.title', '系統公告')}
                            </DialogDescription>
                            <DialogTitle className="text-base leading-snug">
                                {announcement.title}
                            </DialogTitle>
                        </div>
                    </div>
                </DialogHeader>

                {announcement.body && (
                    <ScrollArea className="max-h-[55vh]">
                        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground pr-3">
                            {announcement.body}
                        </p>
                    </ScrollArea>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={handleDismissForever}>
                        {t('dontShowAgain', '不再顯示')}
                    </Button>
                    <Button onClick={onClose}>
                        {t('close', '關閉')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
