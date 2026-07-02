/**
 * 回饋詳情 Sheet:內容 + 問卷數據 + 系統資訊 + 管理(狀態/備註/刪除)。
 * 樣式全走語意 token;Portal 元件(Select/AlertDialog)不做手動覆寫,
 * 由 documentElement 的 .dark(admin 強制)保證一致。
 */

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../../components/ui/alert-dialog';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Trash2, Save, Loader2, Monitor, Globe, Maximize2, Moon, Tag } from 'lucide-react';
import type { FeedbackRecord, FeedbackStatus } from '../types';
import { useUpdateFeedback, useDeleteFeedback } from '../hooks/useFeedbacks';
import { TYPE_CONFIG } from './feedbackConfig';

const SOURCE_LABELS: Record<string, string> = {
    discord: 'Discord', google: 'Google', friends: '朋友推薦',
    bahamut: '巴哈姆特', instagram: 'Instagram', threads: 'Threads', other: '其他',
};

const USAGE_TIME_LABELS: Record<string, string> = {
    morning: '早上', afternoon: '下午', evening: '晚上', lateNight: '深夜',
};

const USAGE_DURATION_LABELS: Record<string, string> = {
    firstTime: '首次', oneWeek: '< 1 週', oneMonth: '< 1 月', halfYear: '< 半年', yearPlus: '1 年+',
};

interface FeedbackDetailProps {
    record: FeedbackRecord | null;
    open: boolean;
    onClose: () => void;
}

export function FeedbackDetail({ record, open, onClose }: FeedbackDetailProps) {
    const [status, setStatus] = useState<FeedbackStatus>('unread');
    const [notes, setNotes] = useState('');
    const updateMutation = useUpdateFeedback();
    const deleteMutation = useDeleteFeedback();

    // Sync local state when record changes
    useEffect(() => {
        if (record && open) {
            setStatus(record.status);
            setNotes(record.admin_notes ?? '');
        }
        // record 物件每次查詢是新 reference,以 id 判斷是否換了記錄
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record?.id, open]);

    const handleSave = () => {
        if (!record) return;
        updateMutation.mutate({
            id: record.id,
            updates: { status, admin_notes: notes || null },
        }, { onSuccess: onClose });
    };

    const handleDelete = () => {
        if (!record) return;
        deleteMutation.mutate(record.id, { onSuccess: onClose });
    };

    if (!record) return null;

    const typeConf = TYPE_CONFIG[record.feedback_type] || TYPE_CONFIG.other;
    const TypeIcon = typeConf.icon;
    const hasChanged = status !== record.status || (notes || '') !== (record.admin_notes || '');

    return (
        <Sheet open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
            <SheetContent className="w-full sm:max-w-[480px] p-0 flex flex-col overflow-hidden gap-0">
                <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
                    <SheetTitle className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center bg-muted ${typeConf.color}`}>
                            <TypeIcon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[14px] font-medium">{typeConf.label}</span>
                        <span className="text-[11px] text-muted-foreground font-normal ml-auto">
                            {new Date(record.created_at).toLocaleString('zh-TW')}
                        </span>
                    </SheetTitle>
                </SheetHeader>

                <ScrollArea className="flex-1 min-h-0">
                    <div className="px-5 py-4 space-y-5">
                        {/* Content */}
                        <div>
                            <p className="text-[13px] leading-[1.7] text-foreground whitespace-pre-wrap">
                                {record.content}
                            </p>
                        </div>

                        {/* Survey data */}
                        {(record.source || record.usage_time || record.usage_duration || record.rating != null || record.nps_score != null) && (
                            <div className="rounded-lg bg-card border border-border p-3.5 space-y-2.5">
                                <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">問卷數據</h4>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                    {record.source && (
                                        <InfoItem label="來源" value={SOURCE_LABELS[record.source] || record.source} />
                                    )}
                                    {record.usage_time && record.usage_time.length > 0 && (
                                        <InfoItem label="使用時段" value={record.usage_time.map(t => USAGE_TIME_LABELS[t] || t).join('、')} />
                                    )}
                                    {record.usage_duration && (
                                        <InfoItem label="使用時長" value={USAGE_DURATION_LABELS[record.usage_duration] || record.usage_duration} />
                                    )}
                                    {record.rating != null && (
                                        <InfoItem label="滿意度" value={`${'★'.repeat(record.rating)}${'☆'.repeat(Math.max(0, 5 - record.rating))}`} />
                                    )}
                                    {record.nps_score != null && (
                                        <InfoItem label="NPS" value={`${record.nps_score} / 10`} />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* System info */}
                        <div className="rounded-lg bg-card border border-border p-3.5 space-y-2">
                            <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">系統資訊</h4>
                            <div className="space-y-1.5">
                                {record.user_agent && (
                                    <SysItem icon={Globe} value={record.user_agent} />
                                )}
                                {record.screen_resolution && (
                                    <SysItem icon={Monitor} value={`螢幕 ${record.screen_resolution}`} />
                                )}
                                {record.window_size && (
                                    <SysItem icon={Maximize2} value={`視窗 ${record.window_size}`} />
                                )}
                                {record.theme && (
                                    <SysItem icon={Moon} value={record.theme} />
                                )}
                                {record.app_version && (
                                    <SysItem icon={Tag} value={`v${record.app_version}`} />
                                )}
                            </div>
                        </div>

                        {/* Management section */}
                        <div className="space-y-3 pt-1">
                            <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">管理</h4>

                            <div className="space-y-1.5">
                                <label className="text-[12px] text-muted-foreground">狀態</label>
                                <Select value={status} onValueChange={(v: string) => setStatus(v as FeedbackStatus)}>
                                    <SelectTrigger className="h-9 text-[13px] rounded-lg w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unread" className="text-[13px]">未讀</SelectItem>
                                        <SelectItem value="read" className="text-[13px]">已讀</SelectItem>
                                        <SelectItem value="processed" className="text-[13px]">已處理</SelectItem>
                                        <SelectItem value="archived" className="text-[13px]">封存</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[12px] text-muted-foreground">備註</label>
                                <Textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="新增備註..."
                                    className="min-h-[72px] text-[13px] rounded-lg resize-none"
                                />
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                {/* Fixed bottom action bar */}
                <div className="border-t border-border px-5 py-3.5 flex items-center gap-2 bg-background">
                    <Button
                        onClick={handleSave}
                        disabled={updateMutation.isPending || !hasChanged}
                        className="flex-1 h-9 rounded-lg text-[13px] font-medium"
                    >
                        {updateMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                            <Save className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        儲存變更
                    </Button>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-[360px]">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-[15px]">刪除此回饋？</AlertDialogTitle>
                                <AlertDialogDescription className="text-[13px]">
                                    此操作無法復原。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="gap-2">
                                <AlertDialogCancel className="h-8 text-[13px]">
                                    取消
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDelete}
                                    className="h-8 bg-destructive hover:bg-destructive/90 text-white text-[13px]"
                                >
                                    {deleteMutation.isPending ? '刪除中...' : '刪除'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function InfoItem({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="text-[12px] text-foreground mt-0.5">{value}</dd>
        </div>
    );
}

function SysItem({ icon: Icon, value }: { icon: typeof Globe; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <Icon className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground break-all leading-relaxed">{value}</span>
        </div>
    );
}
