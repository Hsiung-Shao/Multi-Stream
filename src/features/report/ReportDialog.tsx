// 資料回報對話框（/api/report）：依回報對象顯示對應的原因（可複選）、說明、來源、聯絡方式與 Turnstile。
// VTuber 資料勾「補充資料」時，展開社群／頻道／簡介欄位（格式由後端正規化，錯誤碼沿用投稿的 contribute.error.*）。
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
import { ScrollArea } from '../../components/ui/scroll-area';
import { TurnstileWidget, type TurnstileHandle } from '../../components/turnstile/TurnstileWidget';
import { REPORT_REASONS, SUGGESTED_FIELDS, submitReport, SubmitError, type ReportInput, type ReportSuggested, type SuggestedField } from '../contribute/api';
import { isHttpUrl } from '../contribute/urlValidation';
import type { ReportTarget } from './reportTarget';

interface FormValues {
    reasons: string[];
    description: string;
    source: string;
    contact: string;
    info: Record<SuggestedField, string>;
}

const EMPTY_INFO: Record<SuggestedField, string> = { x: '', facebook: '', instagram: '', youtube: '', twitch: '', bio: '' };

/** 只留有填的欄位；全空回 null */
export function filledSuggested(info: Record<SuggestedField, string>): ReportSuggested | null {
    const out: ReportSuggested = {};
    for (const k of SUGGESTED_FIELDS) if (info[k]?.trim()) out[k] = info[k].trim();
    return Object.keys(out).length ? out : null;
}

const INFO_PLACEHOLDER: Record<Exclude<SuggestedField, 'bio' | 'youtube'>, string> = {
    x: '@…',
    facebook: 'https://www.facebook.com/…',
    instagram: '@…',
    twitch: 'twitch.tv/…',
};

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
    const { control, register, handleSubmit, getValues, trigger, watch, formState } = useForm<FormValues>({
        defaultValues: { reasons: [], description: '', source: '', contact: '', info: EMPTY_INFO },
    });
    const addInfo = watch('reasons').includes('add_info');
    const { errors, isSubmitting } = formState;
    const turnstile = useRef<TurnstileHandle>(null);
    const [token, setToken] = useState<string | null>(null);
    const [serverError, setServerError] = useState<string | null>(null);

    const onSubmit = async (v: FormValues) => {
        setServerError(null);
        const suggested = v.reasons.includes('add_info') ? filledSuggested(v.info) : null;
        try {
            await submitReport({
                ...targetFields(target),
                reasons: v.reasons,
                ...(suggested ? { suggested } : {}),
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
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{titleOf(target, t)}</DialogTitle>
                    <DialogDescription>
                        {target.kind === 'stream' && target.title && <span className="mb-1 line-clamp-2 block text-foreground/80">{target.title}</span>}
                        {t('report.dialogHint')}
                    </DialogDescription>
                </DialogHeader>
                {/* 內容較長時只捲動表單本體，標題與按鈕固定 */}
                <ScrollArea className="-mx-6 [&>[data-radix-scroll-area-viewport]]:max-h-[60vh] [&>div>div]:!block">
                <form id="report-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 px-6">
                    <fieldset>
                        <legend className="mb-2 text-sm font-medium">{t('report.reasonsLabel')}</legend>
                        <Controller
                            control={control}
                            name="reasons"
                            rules={{
                                validate: (v) =>
                                    v.length === 0
                                        ? t('report.reasonsRequired')
                                        : !v.includes('add_info') || !!filledSuggested(getValues('info')) || t('report.infoRequired'),
                            }}
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
                                                    onCheckedChange={(c: boolean | 'indeterminate') => {
                                                        field.onChange(c ? [...field.value, r] : field.value.filter((x) => x !== r));
                                                        // 「其他」需要說明：勾選改變時重新檢查說明，取消勾選就清掉錯誤
                                                        if (r === 'other' && formState.isSubmitted) void trigger('description');
                                                    }}
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

                    {addInfo && (
                        <fieldset className="space-y-3 rounded-lg border border-border p-3">
                            <legend className="px-1 text-sm font-medium">{t('report.infoLabel')}</legend>
                            <p className="text-xs text-muted-foreground">{t('report.infoHint')}</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {(['x', 'facebook', 'instagram', 'twitch'] as const).map((k) => (
                                    <div key={k} className="space-y-1.5">
                                        <Label htmlFor={`report-info-${k}`}>{t(`contribute.social.${k}`)}</Label>
                                        <Input
                                            id={`report-info-${k}`}
                                            autoComplete="off"
                                            maxLength={300}
                                            placeholder={INFO_PLACEHOLDER[k]}
                                            {...register(`info.${k}`, { onChange: () => formState.isSubmitted && void trigger('reasons') })}
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="report-info-youtube">{t('contribute.youtubeUrl')}</Label>
                                <Input
                                    id="report-info-youtube"
                                    inputMode="url"
                                    autoComplete="off"
                                    maxLength={300}
                                    placeholder={t('contribute.youtubeUrlPlaceholder')}
                                    {...register('info.youtube', { onChange: () => formState.isSubmitted && void trigger('reasons') })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="report-info-bio">{t('contribute.bio')}</Label>
                                <Textarea
                                    id="report-info-bio"
                                    rows={3}
                                    maxLength={500}
                                    placeholder={t('contribute.bioPlaceholder')}
                                    {...register('info.bio', { onChange: () => formState.isSubmitted && void trigger('reasons') })}
                                />
                            </div>
                        </fieldset>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="report-desc">{t('report.description')}</Label>
                        <Textarea
                            id="report-desc"
                            rows={3}
                            maxLength={1000}
                            placeholder={t('report.descriptionPlaceholder')}
                            aria-invalid={!!errors.description}
                            aria-describedby={errors.description ? 'report-desc-err' : undefined}
                            {...register('description', {
                                maxLength: { value: 1000, message: t('contribute.tooLong', { max: 1000 }) },
                                // 讀當下的值（不用 render 時的 watch 快照）：勾選改變後立刻 trigger 才會用到新值
                                validate: (v) => !getValues('reasons').includes('other') || !!v.trim() || t('report.descriptionRequired'),
                            })}
                        />
                        {errors.description && <p id="report-desc-err" role="alert" className="text-xs text-destructive">{errors.description.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="report-source">{t('report.source')}</Label>
                        <Input
                            id="report-source"
                            inputMode="url"
                            maxLength={2048}
                            placeholder="https://"
                            aria-invalid={!!errors.source}
                            aria-describedby={errors.source ? 'report-source-err' : undefined}
                            {...register('source', { validate: (v) => !v.trim() || isHttpUrl(v) || t('contribute.error.invalid_source_urls') })}
                        />
                        {errors.source && <p id="report-source-err" role="alert" className="text-xs text-destructive">{errors.source.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="report-contact">{t('report.contact')}</Label>
                        <Input
                            id="report-contact"
                            autoComplete="email"
                            maxLength={200}
                            aria-invalid={!!errors.contact}
                            aria-describedby={errors.contact ? 'report-contact-err' : undefined}
                            {...register('contact', { maxLength: { value: 200, message: t('contribute.tooLong', { max: 200 }) } })}
                        />
                        {errors.contact && <p id="report-contact-err" role="alert" className="text-xs text-destructive">{errors.contact.message}</p>}
                    </div>
                    <TurnstileWidget ref={turnstile} onToken={setToken} />
                    {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
                </form>
                </ScrollArea>
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
