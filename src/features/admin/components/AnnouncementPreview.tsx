/**
 * 公告 1:1 前台預覽(嵌在 AnnouncementEditDialog 表單下方)。
 *
 * 三種型態都重用「真實前台元件」而非複製品,確保所見即所得:
 *   - announcement → 真的呼叫 showAnnouncementToast()(sonner z-index 蓋過 Dialog,
 *     固定 preview id,重按原地更新;不傳 onDismissForever 所以不寫 storage)
 *   - poll → 巢狀渲染 AnnouncementPollModal(preview 模式:不打 API、不寫 flag,
 *     送出直接顯示本地假結果)
 *   - survey → inline 渲染前台 chip(AnnouncementSurveyChip 注入定位 class),
 *     點 chip 開真實問卷 Dialog(preview 模式)
 *
 * announcement 為 null 表示表單尚未通過驗證(disabledReason 說明原因)。
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, Megaphone } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { showAnnouncementToast } from '../../announcements/AnnouncementToast';
import { AnnouncementDetailDialog } from '../../announcements/AnnouncementDetailDialog';
import { AnnouncementPollModal } from '../../announcements/AnnouncementPollModal';
import { AnnouncementSurveyChip } from '../../announcements/AnnouncementSurveyChip';
import type { Announcement } from '../../announcements/types';

interface Props {
    /** 通過驗證的預覽資料;null = 表單未達預覽門檻 */
    announcement: Announcement | null;
    /** 無法預覽的原因(驗證錯誤訊息) */
    disabledReason?: string;
}

export function AnnouncementPreview({ announcement, disabledReason }: Props) {
    const [pollPreviewOpen, setPollPreviewOpen] = useState(false);
    // toast 點「查看詳情」後開啟的詳情 Dialog 預覽
    const [detailPreviewOpen, setDetailPreviewOpen] = useState(false);
    // 換 key 重掛 survey chip,重設「謝謝填寫」等內部狀態
    const [surveyPreviewKey, setSurveyPreviewKey] = useState(0);

    const type = announcement?.type;

    // 預覽元件卸載(編輯 Dialog 關閉)時把還掛著的預覽 toast 收掉,
    // 避免 toast 活得比它所屬的 Dialog 久、飄在後台其他畫面上
    useEffect(() => {
        return () => {
            toast.dismiss('announcement:__preview__');
        };
    }, []);

    // survey chip 的重掛 key:依 payload「結構」而非 title——
    // 標題打字不重掛(避免預覽中的填答狀態被清空),但題目/選項改動要重掛
    // (否則 chip 內部 answers 可能殘留已被刪除的 option id,預覽失真)
    const surveyStructureKey = type === 'survey' && announcement
        ? JSON.stringify(announcement.payload)
        : '';

    const handleToastPreview = () => {
        if (!announcement) return;
        // 不傳 onDismissForever → 按「不再顯示」只關閉 toast,不寫 localStorage
        showAnnouncementToast(announcement, {
            dismissLabel: '不再顯示',
            detailLabel: '查看詳情',
            onViewDetail: () => setDetailPreviewOpen(true),
        });
    };

    return (
        <div className="space-y-3 rounded-lg border border-dashed border-border bg-card/50 p-3">
            <div className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">前台預覽</span>
                <span className="text-[11px] text-muted-foreground">
                    (1:1 重用前台元件;預覽不會送出資料、不影響任何使用者)
                </span>
            </div>

            {!announcement ? (
                <p className="text-[12px] text-muted-foreground">
                    表單尚未完成,無法預覽{disabledReason ? `:${disabledReason}` : ''}
                </p>
            ) : type === 'announcement' ? (
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleToastPreview}
                        className="gap-1.5 text-xs h-8"
                    >
                        <Megaphone className="w-3.5 h-3.5" />
                        預覽通知
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                        通知彈出於畫面角落,8 秒後自動消失;點「查看詳情」可預覽完整公告 Dialog;修改表單後可重按更新
                    </p>
                </div>
            ) : type === 'poll' ? (
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setPollPreviewOpen(true)}
                        className="gap-1.5 text-xs h-8"
                    >
                        <Eye className="w-3.5 h-3.5" />
                        開啟投票預覽
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                        可實際操作:選擇並送出會顯示本地模擬結果(不會寫入資料庫)
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                        前台會在右下角顯示以下 chip,點擊可開啟問卷(送出僅顯示「謝謝填寫」,不會寫入資料庫):
                    </p>
                    <div className="flex items-center">
                        <AnnouncementSurveyChip
                            key={`${surveyPreviewKey}-${surveyStructureKey}`}
                            announcement={announcement}
                            preview
                            chipClassName="relative"
                            onDismiss={() => setSurveyPreviewKey(k => k + 1)}
                        />
                    </div>
                </div>
            )}

            {/* poll 巢狀預覽 Dialog(關閉即卸載,內部 voted 狀態自動重設) */}
            {type === 'poll' && pollPreviewOpen && announcement && (
                <AnnouncementPollModal
                    announcement={announcement}
                    open
                    preview
                    onClose={() => setPollPreviewOpen(false)}
                />
            )}

            {/* announcement 詳情 Dialog 預覽(onDismissForever 傳 noop:按鈕看得到但不寫 storage) */}
            {type === 'announcement' && announcement && (
                <AnnouncementDetailDialog
                    announcement={announcement}
                    open={detailPreviewOpen}
                    onClose={() => setDetailPreviewOpen(false)}
                    onDismissForever={() => {}}
                />
            )}
        </div>
    );
}
