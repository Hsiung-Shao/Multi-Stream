/**
 * 公告 toast 顯示器(無 UI;掛起 sonner toast)
 *
 * 精簡形式:只顯示標題一行 + 「查看詳情」(主按鈕,開 AnnouncementDetailDialog)
 * + 「不再顯示」(subtle 次按鈕)。長內文不塞進 toast,交給詳情 Dialog 閱讀。
 *
 * showAnnouncementToast 抽成獨立函式:前台與 admin 發布預覽共用同一份
 * toast options,確保預覽 1:1(admin 預覽不傳 onDismissForever,不寫 storage)。
 *
 * 為何不只寫成函式:AnnouncementToast 包裝負責 ack i18n、provider lifecycle。
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Megaphone } from 'lucide-react';
import type { Announcement } from './types';
import { setFlag } from './storage';

interface Props {
    announcement: Announcement;
    /** 按「查看詳情」時開啟詳情 Dialog(由 provider 管理 state) */
    onViewDetail: () => void;
}

const AUTO_DISMISS_MS = 8000;

/**
 * 顯示公告 toast(前台與 admin 預覽共用)。
 * @param opts.onViewDetail 按「查看詳情」的行為;body 為空或未提供時不顯示該按鈕
 * @param opts.onDismissForever 按「不再顯示」時的副作用(前台寫 dismissed flag;預覽不傳)
 * @returns sonner toast id(同 id 重複呼叫會原地更新,預覽用)
 */
export function showAnnouncementToast(
    announcement: Pick<Announcement, 'id' | 'title' | 'body'>,
    opts: {
        dismissLabel: string;
        detailLabel: string;
        onViewDetail?: () => void;
        onDismissForever?: () => void;
    },
): string {
    const id = `announcement:${announcement.id}`;
    const hasDetail = Boolean(announcement.body) && Boolean(opts.onViewDetail);
    toast.message(announcement.title, {
        id,
        duration: AUTO_DISMISS_MS,
        icon: <Megaphone className="size-4" />,
        // 主動作:查看詳情(有內文才顯示)
        action: hasDetail
            ? {
                label: opts.detailLabel,
                onClick: () => {
                    opts.onViewDetail?.();
                    toast.dismiss(id);
                },
            }
            : undefined,
        // 次動作:不再顯示(subtle 樣式,不與標題搶視覺)
        cancel: {
            label: opts.dismissLabel,
            onClick: () => {
                opts.onDismissForever?.();
                toast.dismiss(id);
            },
        },
    });
    return id;
}

export function AnnouncementToast({ announcement, onViewDetail }: Props) {
    const { t } = useTranslation('announcements');

    useEffect(() => {
        showAnnouncementToast(announcement, {
            dismissLabel: t('dontShowAgain', '不再顯示'),
            detailLabel: t('announcement.viewDetail', '查看詳情'),
            onViewDetail,
            onDismissForever: () => setFlag('dismissed', announcement.id),
        });
        // 純掛載觸發,不重複觸發(announcement.id 變了才會跑第二次)
        return () => {
            // unmount 不主動 dismiss — 讓 sonner 自然到時關;
            // user 若已關掉,id 不存在也不會出錯
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [announcement.id]);

    return null;
}
