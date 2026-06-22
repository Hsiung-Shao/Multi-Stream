// 公告編輯/新增 Dialog
//
// 三種 type 的 payload 動態表單:
//   - announcement: 不顯示 payload 欄位
//   - poll: options[] (label + auto id) + multi_select toggle
//   - survey: questions[] (id / label / type) + 若 single|multi 則 options[]
//
// 編輯已 published 公告會跳二次確認(避免影響 user 已看到的內容)
//
// id 用 crypto.randomUUID 短前綴(8 字元),足以避免 collision 又便於 debug

import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Switch } from '../../../components/ui/switch';
import { Label } from '../../../components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui/select';
import {
    useCreateAnnouncement,
    useUpdateAnnouncement,
    formatAdminAnnouncementError,
    type AnnouncementRecord,
    type AnnouncementType,
    type AnnouncementStatus,
    type TargetSegment,
    type SurveyQuestionType,
    type AnnouncementWriteInput,
} from '../hooks/useAdminAnnouncements';

// ---------- Local form types(用陣列方便加減) ----------

interface FormPollOption {
    id: string;
    label: string;
}
interface FormSurveyOption {
    id: string;
    label: string;
}
interface FormSurveyQuestion {
    id: string;
    label: string;
    type: SurveyQuestionType;
    options: FormSurveyOption[];
}
interface FormState {
    type: AnnouncementType;
    title: string;
    body: string;
    target_segment: TargetSegment;
    priority: number;
    starts_at: string;   // datetime-local 字串(無 timezone)
    ends_at: string;     // 空字串代表 null
    status: AnnouncementStatus;
    // poll
    poll_options: FormPollOption[];
    poll_multi_select: boolean;
    // survey
    survey_questions: FormSurveyQuestion[];
}

// ---------- 工具 ----------

function shortId(): string {
    // 8 字元 hex,collision 機率極低且方便人類閱讀
    return uuidv4().replace(/-/g, '').slice(0, 8);
}

/**
 * datetime-local input value <-> ISO string
 * datetime-local 沒有 timezone,我們把它解釋為「local time」轉成 ISO(UTC)。
 */
function isoToLocalInput(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        // 補上 timezone offset 後輸出 YYYY-MM-DDTHH:mm
        const off = d.getTimezoneOffset() * 60_000;
        const local = new Date(d.getTime() - off);
        return local.toISOString().slice(0, 16);
    } catch { return ''; }
}

function localInputToIso(local: string): string | null {
    if (!local) return null;
    try {
        // datetime-local 字串解釋為 local time
        const d = new Date(local);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
    } catch { return null; }
}

function defaultForm(): FormState {
    const now = new Date();
    return {
        type: 'announcement',
        title: '',
        body: '',
        target_segment: 'all',
        priority: 0,
        starts_at: isoToLocalInput(now.toISOString()),
        ends_at: '',
        status: 'draft',
        poll_options: [{ id: shortId(), label: '' }, { id: shortId(), label: '' }],
        poll_multi_select: false,
        survey_questions: [makeQuestion()],
    };
}

function makeQuestion(): FormSurveyQuestion {
    return {
        id: shortId(),
        label: '',
        type: 'single',
        options: [{ id: shortId(), label: '' }, { id: shortId(), label: '' }],
    };
}

function recordToForm(r: AnnouncementRecord): FormState {
    const base = defaultForm();
    base.type = r.type;
    base.title = r.title;
    base.body = r.body ?? '';
    base.target_segment = r.target_segment;
    base.priority = r.priority;
    base.starts_at = isoToLocalInput(r.starts_at);
    base.ends_at = isoToLocalInput(r.ends_at);
    base.status = r.status;

    const p = r.payload as any;
    if (r.type === 'poll' && p && Array.isArray(p.options)) {
        base.poll_options = p.options.map((o: any) => ({
            id: typeof o?.id === 'string' && o.id ? o.id : shortId(),
            label: typeof o?.label === 'string' ? o.label : '',
        }));
        base.poll_multi_select = !!p.multi_select;
    }
    if (r.type === 'survey' && p && Array.isArray(p.questions)) {
        base.survey_questions = p.questions.map((q: any): FormSurveyQuestion => ({
            id: typeof q?.id === 'string' && q.id ? q.id : shortId(),
            label: typeof q?.label === 'string' ? q.label : '',
            type: (['single', 'multi', 'text'] as const).includes(q?.type) ? q.type : 'single',
            options: Array.isArray(q?.options)
                ? q.options.map((o: any) => ({
                    id: typeof o?.id === 'string' && o.id ? o.id : shortId(),
                    label: typeof o?.label === 'string' ? o.label : '',
                }))
                : [{ id: shortId(), label: '' }, { id: shortId(), label: '' }],
        }));
        if (base.survey_questions.length === 0) base.survey_questions = [makeQuestion()];
    }
    return base;
}

interface ValidationResult {
    ok: boolean;
    error?: string;
}

function validateForm(f: FormState): ValidationResult {
    if (!f.title.trim()) return { ok: false, error: '請填寫標題' };
    if (f.starts_at && !localInputToIso(f.starts_at)) {
        return { ok: false, error: '開始時間格式錯誤' };
    }
    if (f.ends_at && !localInputToIso(f.ends_at)) {
        return { ok: false, error: '結束時間格式錯誤' };
    }
    if (f.starts_at && f.ends_at) {
        const s = new Date(f.starts_at).getTime();
        const e = new Date(f.ends_at).getTime();
        if (Number.isFinite(s) && Number.isFinite(e) && e <= s) {
            return { ok: false, error: '結束時間必須晚於開始時間' };
        }
    }
    if (!Number.isFinite(f.priority)) return { ok: false, error: '優先度必須為整數' };

    if (f.type === 'poll') {
        const opts = f.poll_options.map(o => ({ ...o, label: o.label.trim() })).filter(o => o.label);
        if (opts.length < 2) return { ok: false, error: '投票至少需要 2 個有效選項' };
        const ids = new Set(opts.map(o => o.id));
        if (ids.size !== opts.length) return { ok: false, error: '投票選項 ID 重複' };
    }

    if (f.type === 'survey') {
        if (f.survey_questions.length === 0) return { ok: false, error: '問卷至少需要 1 題' };
        const qIds = new Set<string>();
        for (let qi = 0; qi < f.survey_questions.length; qi++) {
            const q = f.survey_questions[qi];
            if (!q.label.trim()) return { ok: false, error: `第 ${qi + 1} 題缺少題目` };
            if (qIds.has(q.id)) return { ok: false, error: `第 ${qi + 1} 題 ID 重複` };
            qIds.add(q.id);
            if (q.type === 'single' || q.type === 'multi') {
                const opts = q.options.map(o => ({ ...o, label: o.label.trim() })).filter(o => o.label);
                if (opts.length < 2) return { ok: false, error: `第 ${qi + 1} 題至少需要 2 個有效選項` };
                const oIds = new Set(opts.map(o => o.id));
                if (oIds.size !== opts.length) return { ok: false, error: `第 ${qi + 1} 題選項 ID 重複` };
            }
        }
    }
    return { ok: true };
}

function formToWriteInput(f: FormState): AnnouncementWriteInput {
    const input: AnnouncementWriteInput = {
        type: f.type,
        title: f.title.trim(),
        body: f.body.trim() || null,
        target_segment: f.target_segment,
        priority: Number.isFinite(f.priority) ? Math.trunc(f.priority) : 0,
        starts_at: f.starts_at ? localInputToIso(f.starts_at) : null,
        ends_at: f.ends_at ? localInputToIso(f.ends_at) : null,
        status: f.status,
        payload: null,
    };
    if (f.type === 'poll') {
        input.payload = {
            options: f.poll_options
                .map(o => ({ id: o.id, label: o.label.trim() }))
                .filter(o => o.label),
            multi_select: f.poll_multi_select,
        };
    } else if (f.type === 'survey') {
        input.payload = {
            questions: f.survey_questions.map(q => {
                const base: any = { id: q.id, label: q.label.trim(), type: q.type };
                if (q.type !== 'text') {
                    base.options = q.options
                        .map(o => ({ id: o.id, label: o.label.trim() }))
                        .filter(o => o.label);
                }
                return base;
            }),
        };
    }
    return input;
}

// ---------- Component ----------

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    target: AnnouncementRecord | null;
}

export function AnnouncementEditDialog({ open, onOpenChange, target }: Props) {
    const isEdit = !!target;
    const wasPublished = target?.status === 'published';

    const [form, setForm] = useState<FormState>(defaultForm);
    const [pendingConfirm, setPendingConfirm] = useState<AnnouncementWriteInput | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);

    const createMutation = useCreateAnnouncement();
    const updateMutation = useUpdateAnnouncement();
    const isPending = createMutation.isPending || updateMutation.isPending;
    const mutationError = createMutation.error || updateMutation.error;

    // Reset form / mutation whenever dialog open state changes
    // 包含 close → 確保 stale pending state 不會延續到下次 open(否則 button 永遠 disabled)
    useEffect(() => {
        setLocalError(null);
        createMutation.reset();
        updateMutation.reset();
        if (open) {
            setForm(target ? recordToForm(target) : defaultForm());
        }
        // 不把 mutation 加 deps,避免 re-reset
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, target?.id]);

    const updateField = <K extends keyof FormState>(key: K, val: FormState[K]) => {
        setForm(prev => ({ ...prev, [key]: val }));
    };

    // 切 type 只發生在新增模式(編輯時 Select disabled),而新增模式下
    // poll_options / survey_questions 由 defaultForm 保證非空(移除鈕在最小數量時 disabled),直接換 type 即可
    const handleTypeChange = (next: AnnouncementType) => updateField('type', next);

    // ---- Poll options helpers ----
    const addPollOption = () => updateField('poll_options', [...form.poll_options, { id: shortId(), label: '' }]);
    const removePollOption = (id: string) => updateField('poll_options', form.poll_options.filter(o => o.id !== id));
    const updatePollOption = (id: string, label: string) =>
        updateField('poll_options', form.poll_options.map(o => o.id === id ? { ...o, label } : o));

    // ---- Survey helpers ----
    const addSurveyQuestion = () => updateField('survey_questions', [...form.survey_questions, makeQuestion()]);
    const removeSurveyQuestion = (id: string) =>
        updateField('survey_questions', form.survey_questions.filter(q => q.id !== id));
    const updateSurveyQuestion = (id: string, patch: Partial<FormSurveyQuestion>) =>
        updateField('survey_questions', form.survey_questions.map(q => q.id === id ? { ...q, ...patch } : q));
    const addSurveyOption = (qId: string) =>
        updateField('survey_questions', form.survey_questions.map(q =>
            q.id === qId ? { ...q, options: [...q.options, { id: shortId(), label: '' }] } : q));
    const removeSurveyOption = (qId: string, oId: string) =>
        updateField('survey_questions', form.survey_questions.map(q =>
            q.id === qId ? { ...q, options: q.options.filter(o => o.id !== oId) } : q));
    const updateSurveyOption = (qId: string, oId: string, label: string) =>
        updateField('survey_questions', form.survey_questions.map(q =>
            q.id === qId ? { ...q, options: q.options.map(o => o.id === oId ? { ...o, label } : o) } : q));

    const handleSubmit = () => {
        setLocalError(null);
        const v = validateForm(form);
        if (!v.ok) {
            setLocalError(v.error || '驗證失敗');
            return;
        }
        const input = formToWriteInput(form);
        // 編輯已 published 公告 → 二次確認
        if (isEdit && wasPublished) {
            setPendingConfirm(input);
            return;
        }
        executeSubmit(input);
    };

    const executeSubmit = async (input: AnnouncementWriteInput) => {
        try {
            if (isEdit && target) {
                await updateMutation.mutateAsync({ id: target.id, updates: input });
            } else {
                await createMutation.mutateAsync(input);
            }
            setPendingConfirm(null);
            onOpenChange(false);
        } catch {
            // mutationError 自動更新,UI 會顯示
            setPendingConfirm(null);
        }
    };

    const errorText = localError ?? (mutationError ? formatAdminAnnouncementError(mutationError) : null);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-200 max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-zinc-100">
                            {isEdit ? '編輯公告' : '新增公告'}
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500 text-xs">
                            {isEdit ? `ID: ${target?.id}` : '建立後預設為「草稿」狀態,可以日後再發佈'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* type */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">類型 *</Label>
                            <Select
                                value={form.type}
                                onValueChange={(v: string) => handleTypeChange(v as AnnouncementType)}
                                disabled={isEdit}
                            >
                                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="announcement">公告(announcement)</SelectItem>
                                    <SelectItem value="poll">投票(poll)</SelectItem>
                                    <SelectItem value="survey">問卷(survey)</SelectItem>
                                </SelectContent>
                            </Select>
                            {isEdit && (
                                <p className="text-[11px] text-zinc-500">類型在建立後不可變更(避免破壞 responses 結構)</p>
                            )}
                        </div>

                        {/* title */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">標題 *</Label>
                            <Input
                                value={form.title}
                                onChange={(e) => updateField('title', e.target.value)}
                                className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9"
                                maxLength={200}
                                placeholder="例如:重要更新通知"
                            />
                        </div>

                        {/* body */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">內文(選填)</Label>
                            <Textarea
                                value={form.body}
                                onChange={(e) => updateField('body', e.target.value)}
                                className="bg-zinc-900 border-zinc-800 text-zinc-200 min-h-[88px] resize-y"
                                maxLength={10000}
                                placeholder="(可選)補充說明、條款、背景..."
                            />
                            <p className="text-[10px] text-zinc-500 text-right tabular-nums">{form.body.length} / 10000</p>
                        </div>

                        {/* segment + priority */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">目標族群 *</Label>
                                <Select
                                    value={form.target_segment}
                                    onValueChange={(v: string) => updateField('target_segment', v as TargetSegment)}
                                >
                                    <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">全部使用者</SelectItem>
                                        <SelectItem value="authenticated">僅已登入</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">優先度</Label>
                                <Input
                                    type="number"
                                    value={Number.isFinite(form.priority) ? form.priority : 0}
                                    onChange={(e) => updateField('priority', parseInt(e.target.value, 10) || 0)}
                                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9 tabular-nums"
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        {/* time window */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">開始時間</Label>
                                <Input
                                    type="datetime-local"
                                    value={form.starts_at}
                                    onChange={(e) => updateField('starts_at', e.target.value)}
                                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">結束時間(空 = 不過期)</Label>
                                <Input
                                    type="datetime-local"
                                    value={form.ends_at}
                                    onChange={(e) => updateField('ends_at', e.target.value)}
                                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9"
                                />
                            </div>
                        </div>

                        {/* status */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">狀態 *</Label>
                            <Select
                                value={form.status}
                                onValueChange={(v: string) => updateField('status', v as AnnouncementStatus)}
                            >
                                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="draft">草稿(僅 admin 可見)</SelectItem>
                                    <SelectItem value="published">已發布(對外顯示)</SelectItem>
                                    <SelectItem value="archived">已封存(隱藏)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* payload — Poll */}
                        {form.type === 'poll' && (
                            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-zinc-300">投票選項</span>
                                    <div className="flex items-center gap-2">
                                        <Label className="text-[11px] text-zinc-400">允許多選</Label>
                                        <Switch
                                            checked={form.poll_multi_select}
                                            onCheckedChange={(v: boolean) => updateField('poll_multi_select', !!v)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {form.poll_options.map((opt, idx) => (
                                        <div key={opt.id} className="flex items-center gap-2">
                                            <span className="text-[11px] text-zinc-500 w-6 tabular-nums">{idx + 1}.</span>
                                            <Input
                                                value={opt.label}
                                                onChange={(e) => updatePollOption(opt.id, e.target.value)}
                                                className="bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-sm"
                                                placeholder={`選項 ${idx + 1}`}
                                                maxLength={120}
                                            />
                                            <span className="text-[10px] text-zinc-600 font-mono w-16 truncate" title={opt.id}>
                                                {opt.id}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removePollOption(opt.id)}
                                                disabled={form.poll_options.length <= 2}
                                                className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                title="移除"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={addPollOption}
                                    className="gap-1.5 text-xs h-7 bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                                >
                                    <Plus className="w-3 h-3" />
                                    新增選項
                                </Button>
                            </div>
                        )}

                        {/* payload — Survey */}
                        {form.type === 'survey' && (
                            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                                <span className="text-xs font-medium text-zinc-300">問卷題目</span>
                                {form.survey_questions.map((q, qi) => (
                                    <div key={q.id} className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-zinc-500 w-7 tabular-nums">Q{qi + 1}</span>
                                            <Input
                                                value={q.label}
                                                onChange={(e) => updateSurveyQuestion(q.id, { label: e.target.value })}
                                                className="bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-sm flex-1"
                                                placeholder="題目"
                                                maxLength={500}
                                            />
                                            <Select
                                                value={q.type}
                                                onValueChange={(v: string) => updateSurveyQuestion(q.id, { type: v as SurveyQuestionType })}
                                            >
                                                <SelectTrigger className="w-[100px] bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="single">單選</SelectItem>
                                                    <SelectItem value="multi">複選</SelectItem>
                                                    <SelectItem value="text">文字</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span className="text-[10px] text-zinc-600 font-mono w-14 truncate" title={q.id}>
                                                {q.id}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removeSurveyQuestion(q.id)}
                                                disabled={form.survey_questions.length <= 1}
                                                className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                title="移除題目"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        {(q.type === 'single' || q.type === 'multi') && (
                                            <div className="pl-9 space-y-1.5">
                                                {q.options.map((opt, oi) => (
                                                    <div key={opt.id} className="flex items-center gap-2">
                                                        <span className="text-[10px] text-zinc-500 w-5 tabular-nums">{oi + 1}.</span>
                                                        <Input
                                                            value={opt.label}
                                                            onChange={(e) => updateSurveyOption(q.id, opt.id, e.target.value)}
                                                            className="bg-zinc-900 border-zinc-800 text-zinc-300 h-7 text-xs"
                                                            placeholder={`選項 ${oi + 1}`}
                                                            maxLength={120}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => removeSurveyOption(q.id, opt.id)}
                                                            disabled={q.options.length <= 2}
                                                            className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                            title="移除選項"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => addSurveyOption(q.id)}
                                                    className="gap-1 text-[11px] h-6 bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 ml-7"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                    新增選項
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={addSurveyQuestion}
                                    className="gap-1.5 text-xs h-7 bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                                >
                                    <Plus className="w-3 h-3" />
                                    新增題目
                                </Button>
                            </div>
                        )}

                        {/* error */}
                        {errorText && (
                            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/25">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-[12px] text-red-400">{errorText}</p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isPending}
                            className="bg-blue-600 hover:bg-blue-500 gap-1.5"
                        >
                            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {isEdit ? '儲存變更' : '建立'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 編輯已 published 公告的二次確認 */}
            <AlertDialog
                open={!!pendingConfirm}
                onOpenChange={(v) => { if (!v) setPendingConfirm(null); }}
            >
                <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-zinc-100">確定要修改已發布的公告?</AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                            此公告目前狀態為「已發布」,使用者可能已看過或已投票/填過問卷。
                            <br />
                            <span className="text-amber-400">
                                修改內容、選項或時間窗可能會影響使用者已經提交的回應(他們不會被通知)。
                            </span>
                            <br />
                            建議:若有重大改動,請改為「新建一則新公告」並把舊的設為封存。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
                        >
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => pendingConfirm && executeSubmit(pendingConfirm)}
                            disabled={isPending}
                            className="bg-amber-600 hover:bg-amber-500"
                        >
                            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                            確認修改
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
