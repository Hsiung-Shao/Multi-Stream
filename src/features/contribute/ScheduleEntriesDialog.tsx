// 「提供週表」對話框（/api/schedule/entries）：使用者手動填某位 VTuber 接下來的開台（最多 7 列），後台審核通過才出現在週表。
// 日期選項＝台北時間今天～未來 10 天（與後端 functions/lib/schedule-submit.js 的範圍一致），時間也以台北時間填寫。
// 由 ScheduleEntriesDialogProvider 以 lazy 載入、全頁只有一個實例。

import { useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { TurnstileWidget, type TurnstileHandle } from '../../components/turnstile/TurnstileWidget';
import { formatDayHeading } from '../schedule/formatTime';
import { submitScheduleEntries, SubmitError, type SchedulePlatform } from './api';

export interface ScheduleEntriesTarget {
    vtuberId: string;
    name: string;
    /** 這位 VTuber 有 Twitch 頻道時才給 Twitch 選項 */
    hasTwitch?: boolean;
}

interface RowValues {
    date: string;
    time: string;
    title: string;
    platform: SchedulePlatform;
}

interface FormValues {
    rows: RowValues[];
    note: string;
    contact: string;
}

const MAX_ROWS = 7;
const TITLE_MAX = 80;
const FUTURE_DAYS = 10;
const DAY_MS = 86_400_000;

/** 台北時間今天～未來 10 天的 YYYY-MM-DD（台灣固定 +8、無日光節約） */
export function taipeiDateOptions(now: number = Date.now()): string[] {
    const today = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
    const base = Date.parse(`${today}T12:00:00Z`);
    return Array.from({ length: FUTURE_DAYS + 1 }, (_, i) => new Date(base + i * DAY_MS).toISOString().slice(0, 10));
}

const emptyRow = (date: string): RowValues => ({ date, time: '', title: '', platform: 'youtube' });

export default function ScheduleEntriesDialog({ target, onClose }: { target: ScheduleEntriesTarget; onClose: () => void }) {
    const { t, i18n } = useTranslation('schedule');
    const dates = useMemo(() => taipeiDateOptions(), []);
    const dateLabels = useMemo(() => new Map(dates.map((d) => [d, formatDayHeading(d, i18n.language)])), [dates, i18n.language]);
    const { control, register, handleSubmit, getValues, trigger, formState } = useForm<FormValues>({
        defaultValues: { rows: [emptyRow(dates[0])], note: '', contact: '' },
    });
    // 改日期或時間後，所有列的「同日同時」檢查都要重跑（重複是跨列的關係，不只影響正在改的那一列）
    const revalidateRows = () => {
        if (formState.isSubmitted) void trigger('rows');
    };
    const { fields, append, remove } = useFieldArray({ control, name: 'rows' });
    const { errors, isSubmitting } = formState;
    const turnstile = useRef<TurnstileHandle>(null);
    const [token, setToken] = useState<string | null>(null);
    const [serverError, setServerError] = useState<string | null>(null);

    const onSubmit = async (v: FormValues) => {
        setServerError(null);
        try {
            await submitScheduleEntries({
                vtuberId: target.vtuberId,
                entries: v.rows.map((r) => ({ date: r.date, time: r.time, title: r.title.trim(), platform: target.hasTwitch ? r.platform : 'youtube' })),
                note: v.note.trim() || undefined,
                contact: v.contact.trim() || undefined,
                turnstileToken: token,
            });
            toast.success(t('scheduleEntries.success'));
            onClose();
        } catch (e) {
            const code = e instanceof SubmitError ? e.code : 'generic';
            // pending_exists 在投稿 VTuber 時指「頻道已有人推薦」，週表要換成自己的文案
            setServerError(
                code === 'pending_exists'
                    ? t('scheduleEntries.pendingExists')
                    : t(`contribute.error.${code}`, { defaultValue: t('contribute.error.generic') }),
            );
            turnstile.current?.reset();
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t('scheduleEntries.title', { name: target.name })}</DialogTitle>
                    <DialogDescription>{t('scheduleEntries.description')}</DialogDescription>
                </DialogHeader>
                {/* 內容較長時只捲動表單本體，標題與按鈕固定 */}
                <ScrollArea className="-mx-6 [&>[data-radix-scroll-area-viewport]]:max-h-[60vh] [&>div>div]:!block">
                    <form id="schedule-entries-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 px-6">
                        <fieldset className="space-y-3">
                            <legend className="mb-1 text-sm font-medium">{t('scheduleEntries.rowsLabel')}</legend>
                            <p className="text-xs text-muted-foreground">{t('scheduleEntries.timezoneHint')}</p>
                            {fields.map((field, i) => {
                                const rowErr = errors.rows?.[i];
                                const msg = rowErr?.date?.message ?? rowErr?.time?.message ?? rowErr?.title?.message;
                                return (
                                    <div key={field.id} className="rounded-lg border border-border p-3">
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.2fr_1fr_1fr]">
                                            <div className="space-y-1">
                                                <Label htmlFor={`sched-date-${i}`} className="text-xs">{t('scheduleEntries.date')}</Label>
                                                <Controller
                                                    control={control}
                                                    name={`rows.${i}.date`}
                                                    rules={{ required: t('scheduleEntries.dateRequired') }}
                                                    render={({ field: f }) => (
                                                        <Select
                                                            value={f.value}
                                                            onValueChange={(v: string) => {
                                                                f.onChange(v);
                                                                revalidateRows();
                                                            }}
                                                        >
                                                            <SelectTrigger id={`sched-date-${i}`} className="h-9">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {dates.map((d) => (
                                                                    <SelectItem key={d} value={d}>{dateLabels.get(d)}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor={`sched-time-${i}`} className="text-xs">{t('scheduleEntries.time')}</Label>
                                                <Input
                                                    id={`sched-time-${i}`}
                                                    type="time"
                                                    className="h-9"
                                                    aria-invalid={!!rowErr?.time}
                                                    {...register(`rows.${i}.time`, {
                                                        required: t('scheduleEntries.timeRequired'),
                                                        pattern: { value: /^([01]\d|2[0-3]):[0-5]\d$/, message: t('contribute.error.invalid_entry_time') },
                                                        onChange: revalidateRows,
                                                        // 讀當下的值（不用 render 時的 watch 快照）：同一天同一時間只能一列（看其他所有列，改前面的列也會讓後面的列報錯）
                                                        validate: (v) => {
                                                            const rows = getValues('rows');
                                                            const date = rows[i]?.date;
                                                            return !rows.some((r, j) => j !== i && r.date === date && r.time === v) || t('scheduleEntries.duplicate');
                                                        },
                                                    })}
                                                />
                                            </div>
                                            {target.hasTwitch && (
                                                <div className="space-y-1">
                                                    <Label htmlFor={`sched-platform-${i}`} className="text-xs">{t('scheduleEntries.platform')}</Label>
                                                    <Controller
                                                        control={control}
                                                        name={`rows.${i}.platform`}
                                                        render={({ field: f }) => (
                                                            <Select value={f.value} onValueChange={f.onChange}>
                                                                <SelectTrigger id={`sched-platform-${i}`} className="h-9">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="youtube">YouTube</SelectItem>
                                                                    <SelectItem value="twitch">Twitch</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-2 flex items-end gap-2">
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <Label htmlFor={`sched-title-${i}`} className="text-xs">{t('scheduleEntries.streamTitle')}</Label>
                                                <Input
                                                    id={`sched-title-${i}`}
                                                    maxLength={TITLE_MAX}
                                                    className="h-9"
                                                    placeholder={t('scheduleEntries.streamTitlePlaceholder')}
                                                    aria-invalid={!!rowErr?.title}
                                                    {...register(`rows.${i}.title`, {
                                                        validate: (v) => (!!v.trim() && v.trim().length <= TITLE_MAX) || t('contribute.error.invalid_entry_title'),
                                                    })}
                                                />
                                            </div>
                                            {fields.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-9 shrink-0 text-muted-foreground"
                                                    aria-label={t('scheduleEntries.removeRow')}
                                                    title={t('scheduleEntries.removeRow')}
                                                    onClick={() => remove(i)}
                                                >
                                                    <Trash2 size={15} aria-hidden="true" />
                                                </Button>
                                            )}
                                        </div>
                                        {msg && <p role="alert" className="mt-1.5 text-xs text-destructive">{msg}</p>}
                                    </div>
                                );
                            })}
                            {fields.length < MAX_ROWS && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5"
                                    // 新列預設接在上一列的隔天（最後一天就沿用）
                                    onClick={() => {
                                        const last = getValues('rows').at(-1)?.date ?? dates[0];
                                        const next = dates[Math.min(dates.indexOf(last) + 1, dates.length - 1)] ?? dates[0];
                                        append(emptyRow(next));
                                    }}
                                >
                                    <Plus size={14} aria-hidden="true" />
                                    {t('scheduleEntries.addRow')}
                                </Button>
                            )}
                        </fieldset>

                        <div className="space-y-1.5">
                            <Label htmlFor="sched-note">{t('scheduleEntries.note')}</Label>
                            <Textarea
                                id="sched-note"
                                rows={2}
                                maxLength={500}
                                placeholder={t('scheduleEntries.notePlaceholder')}
                                aria-invalid={!!errors.note}
                                {...register('note', { maxLength: { value: 500, message: t('contribute.tooLong', { max: 500 }) } })}
                            />
                            {errors.note && <p role="alert" className="text-xs text-destructive">{errors.note.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="sched-contact">{t('report.contact')}</Label>
                            <Input
                                id="sched-contact"
                                autoComplete="email"
                                maxLength={200}
                                aria-invalid={!!errors.contact}
                                {...register('contact', { maxLength: { value: 200, message: t('contribute.tooLong', { max: 200 }) } })}
                            />
                            {errors.contact && <p role="alert" className="text-xs text-destructive">{errors.contact.message}</p>}
                        </div>
                        <TurnstileWidget ref={turnstile} onToken={setToken} />
                        {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
                    </form>
                </ScrollArea>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose}>
                        {t('report.cancel')}
                    </Button>
                    <Button type="submit" form="schedule-entries-form" disabled={isSubmitting || token === null} className="gap-2">
                        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                        {t('scheduleEntries.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
