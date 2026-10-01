// 資料回報對話框（/api/report）：依回報對象顯示對應的原因（可複選）、說明、來源、聯絡方式與 Turnstile。
// 由 ReportDialogProvider 以 lazy 載入、全頁只有一個實例（卡片上的按鈕只呼叫 openReport）。

import { useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { TurnstileWidget, type TurnstileHandle } from '../../components/turnstile/TurnstileWidget';
import { REPORT_REASONS, submitReport, SubmitError, type ReportInput } from '../contribute/api';
import type { ReportTarget } from './reportTarget';

interface FormValues {
    reasons: string[];
    description: string;
    source: string;
    contact: string;
}

function titleOf(target: ReportTarget, t: TFunction<'schedule'>): string {
    if (target.kind === 'vtuber_info') return t('report.title.vtuber_info', { name: target.name });
    if (target.kind === 'roster') return t('report.title.roster', { group: target.groupName });
    if (target.kind === 'stream') return t('report.title.stream');
    return t('report.title.missing_vtuber');
}

/** 對話框要送出的對象欄位（與後端 validateReport 對應） */
export function targetFields(target: ReportTarget): Pick<ReportInput, 'kind' | 'vtuberId' | 'groupId' | 'stream'> {
    switch (target.kind) {
        case 'vtuber_info':
            return { kind: 'vtuber_info', vtuberId: target.vtuberId };
        case 'roster':
            return { kind: 'roster', groupId: target.groupId };
        case 'stream':
            return { kind: 'stream', vtuberId: target.vtuberId, stream: { platform: target.platform, externalId: target.externalId } };
        default:
            return { kind: 'missing_vtuber' };
    }
}

export default function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
    const { t } = useTranslation('schedule');
    const reasons = REPORT_REASONS[target.kind];
    const { control, register, handleSubmit, watch, formState } = useForm<FormValues>({
        defaultValues: { reasons: [], description: '', source: '', contact: '' },
    });
    const { errors, isSubmitting } = formState;
    const turnstile = useRef<TurnstileHandle>(null);
    const [token, setToken] = useState<string | null>(null);
    const [serverError, setServerError] = useState<string | null>(null);
    const chosen = watch('reasons');

    const onSubmit = async (v: FormValues) => {
        setServerError(null);
        try {
            await submitReport({
                ...targetFields(target),
                reasons: v.reasons,
                description: v.description.trim() || undefined,
                sourceUrls: v.source.trim() ? [v.source.trim()] : undefined,
                contact: v.contact.trim() || undefined,
                pageUrl: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
                turnstileToken: token,
            });
            toast.success(t('report.success'));
            onClose();
        } catch (e) {
            const code = e instanceof SubmitError ? e.code : 'generic';
            setServerError(t(`contribute.error.${code}`, { defaultValue: t('contribute.error.generic') }));
            turnstile.current?.reset();
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{titleOf(target, t)}</DialogTitle>
                    {target.kind === 'stream' && target.title && <DialogDescription className="line-clamp-2">{target.title}</DialogDescription>}
                </DialogHeader>
                <form id="report-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                    <fieldset>
                        <legend className="mb-2 text-sm font-medium">{t('report.reasonsLabel')}</legend>
                        <Controller
                            control={control}
                            name="reasons"
                            rules={{ validate: (v) => v.length > 0 || t('report.reasonsRequired') }}
                            render={({ field }) => (
                                <div className="flex flex-wrap gap-2">
                                    {reasons.map((r) => {
                                        const on = field.value.includes(r);
                                        return (
                                            <label
                                                key={r}
                                                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${on ? 'border-foreground/40 bg-foreground/[0.06]' : 'border-border hover:bg-foreground/[0.03]'}`}
                                            >
                                                <Checkbox
                                                    checked={on}
                                                    onCheckedChange={(c: boolean | 'indeterminate') => field.onChange(c ? [...field.value, r] : field.value.filter((x) => x !== r))}
                                                />
                                                {t(`report.reason.${r}` as 'report.reason.other')}
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        />
                        {errors.reasons && <p role="alert" className="mt-1.5 text-xs text-destructive">{errors.reasons.message}</p>}
                    </fieldset>

                    <div className="space-y-1.5">
                        <Label htmlFor="report-desc">{t('report.description')}</Label>
                        <Textarea
                            id="report-desc"
                            rows={3}
                            placeholder={t('report.descriptionPlaceholder')}
                            aria-invalid={!!errors.description}
                            {...register('description', {
                                maxLength: { value: 1000, message: t('contribute.tooLong', { max: 1000 }) },
                                validate: (v) => !chosen.includes('other') || !!v.trim() || t('report.descriptionRequired'),
                            })}
                        />
                        {errors.description && <p role="alert" className="text-xs text-destructive">{errors.description.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="report-source">{t('report.source')}</Label>
                        <Input id="report-source" inputMode="url" placeholder="https://" {...register('source', { maxLength: 2048 })} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="report-contact">{t('report.contact')}</Label>
                        <Input id="report-contact" autoComplete="email" {...register('contact', { maxLength: 200 })} />
                    </div>
                    <TurnstileWidget ref={turnstile} onToken={setToken} />
                    {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
                </form>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose}>
                        {t('report.cancel')}
                    </Button>
                    <Button type="submit" form="report-form" disabled={isSubmitting || token === null} className="gap-2">
                        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                        {t('report.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
