/**
 * 公告 toast 顯示器(無 UI;掛起 sonner toast)
 *
 * 用 sonner 的命令式 API:接收 announcement,呼叫 toast.message() 顯示,
 * 提供「不再顯示」按鈕(寫 LocalStorage dismissed flag)。
 *
 * 為何不直接寫成函式:這個包裝負責同時 ack i18n、provider lifecycle(unmount 自動 dismiss)。
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Megaphone } from 'lucide-react';
import type { Announcement } from './types';
import { setFlag } from './storage';

interface Props {
    announcement: Announcement;
}

const AUTO_DISMISS_MS = 8000;

export function AnnouncementToast({ announcement }: Props) {
    const { t } = useTranslation('announcements');

    useEffect(() => {
        const id = `announcement:${announcement.id}`;
        toast.message(announcement.title, {
            id,
            description: announcement.body || undefined,
            duration: AUTO_DISMISS_MS,
            icon: <Megaphone className="size-4" />,
            action: {
                label: t('dontShowAgain', '不再顯示'),
                onClick: () => {
                    setFlag('dismissed', announcement.id);
                    toast.dismiss(id);
                },
            },
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
