// 已知問題 新增／編輯對話框（公告分頁的 AnnouncementEditDialog 精簡版）
//
// - 站方回應是公開內容：不要貼使用者回報原文（可能含個資）；從回饋開啟時也只開空白表單
// - Mutation Dialog 慣例：取消鍵永遠可按、開關兩端都 reset mutation（卡住時才能脫困）

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { cn } from '../../../components/ui/utils';
import {
    ISSUE_AREA_LABEL,
    ISSUE_STATUS_LABEL,
    formatKnownIssueError,
    useSaveKnownIssue,
    type KnownIssueRecord,
    type KnownIssueWriteInput,
} from '../hooks/useAdminKnownIssues';
import type { IssueArea, IssueStatus } from '../../status/api';

const TITLE_MAX = 120;
const BODY_MAX = 4000;

const EMPTY: KnownIssueWriteInput = { title: '', body: '', status: 'investigating', severity: 'minor', areas: [], is_public: false };

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 編輯對象；null＝新增 */
    target: KnownIssueRecord | null;
}

export function KnownIssueEditDialog({ open, onOpenChange, target }: Props) {
    const save = useSaveKnownIssue();
    const [form, setForm] = useState<KnownIssueWriteInput>(EMPTY);
    // 開啟序號：每次開啟（或換對象）＋1。卡住的儲存在取消後才完成時，只能關掉「送出當下那一次」的對話框，
    // 不能把之後重新打開的對話框關掉。
    const openSeq = useRef(0);

    // 開與關都重設：關閉時清掉卡住的 isPending／錯誤，開啟時載入對象
    useEffect(() => {
        save.reset();
        openSeq.current += 1;
        if (!open) return;
        setForm(target
            ? { title: target.title, body: target.body ?? '', status: target.status, severity: target.severity, areas: target.areas, is_public: target.is_public }
            : EMPTY);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在開關或換對象時重設
    }, [open, target]);

    const set = <K extends keyof KnownIssueWriteInput>(key: K, value: KnownIssueWriteInput[K]) => setForm((f) => ({ ...f, [key]: value }));
    const toggleArea = (a: IssueArea) => set('areas', form.areas.includes(a) ? form.areas.filter((x) => x !== a) : [...form.areas, a]);

    const title = form.title.trim();
    const canSubmit = title.length > 0 && title.length <= TITLE_MAX && (form.body ?? '').length <= BODY_MAX && !save.isPending;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        const seq = openSeq.current;
        try {
            await save.mutateAsync({ id: target?.id ?? null, input: { ...form, title, body: form.body?.trim() ? form.body : null } });
            if (seq === openSeq.current) onOpenChange(false);
        } catch {
            // 錯誤顯示在 save.error
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{target ? '編輯已知問題' : '新增已知問題'}</DialogTitle>
                    <DialogDescription>
                        公開後會顯示在 /status（約 1～2 分鐘後更新）。站方回應是公開內容，請自己撰寫，不要貼上使用者回報原文。
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="ki-title">標題</Label>
                        <Input id="ki-title" value={form.title} maxLength={TITLE_MAX} onChange={(e) => set('title', e.target.value)} placeholder="例：部分 YouTube 直播無法偵測開台" />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="ki-body">站方回應</Label>
                        <Textarea id="ki-body" rows={5} value={form.body ?? ''} maxLength={BODY_MAX} onChange={(e) => set('body', e.target.value)} placeholder="目前狀況、影響範圍、暫時的解法、預計何時修好" />
                        <p className="text-right text-[11px] text-muted-foreground">{(form.body ?? '').length} / {BODY_MAX}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="ki-status">處理狀態</Label>
                            <Select value={form.status} onValueChange={(v: string) => set('status', v as IssueStatus)}>
                                <SelectTrigger id="ki-status" className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(ISSUE_STATUS_LABEL) as IssueStatus[]).map((s) => <SelectItem key={s} value={s}>{ISSUE_STATUS_LABEL[s]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ki-severity">影響程度</Label>
                            <Select value={form.severity} onValueChange={(v: string) => set('severity', v as 'minor' | 'major')}>
                                <SelectTrigger id="ki-severity" className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="minor">一般</SelectItem>
                                    <SelectItem value="major">影響較大</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <fieldset className="space-y-1.5">
                        <legend className="text-sm font-medium">影響範圍</legend>
                        <div className="flex flex-wrap gap-1.5">
                            {(Object.keys(ISSUE_AREA_LABEL) as IssueArea[]).map((a) => {
                                const on = form.areas.includes(a);
                                return (
                                    <button
                                        key={a}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => toggleArea(a)}
                                        className={cn(
                                            'rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            on ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {ISSUE_AREA_LABEL[a]}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                        <Label htmlFor="ki-public" className="cursor-pointer">在 /status 公開</Label>
                        <Switch id="ki-public" checked={form.is_public} onCheckedChange={(v: boolean) => set('is_public', v)} />
                    </div>

                    {save.error && <p role="alert" className="text-[13px] text-destructive">{formatKnownIssueError(save.error)}</p>}
                </div>

                <DialogFooter>
                    {/* 取消永遠可按：請求卡住時才能脫困 */}
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit}>
                        {save.isPending && <Loader2 className="size-3.5 animate-spin" />}
                        {target ? '儲存' : '新增'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
