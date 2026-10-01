// 投稿新 VTuber 的表單（/schedule/submit）：左側表單、右側即時預覽（手機版預覽在表單下方）。
// 輸入 YouTube 頻道網址後自動帶入名稱與頭像（useChannelLookup）；已在週表上或已有人推薦時提早導引。
// 送出走 /api/vtuber/contribute（Turnstile＋頻率限制，先進後台待審）。欄位驗證與後端（functions/lib/vtuber-submit.js）一致。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink, Loader2, Send, AlertTriangle } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { RouteLink } from '../../components/Navigation/RouteLink';
import { TurnstileWidget, type TurnstileHandle } from '../../components/turnstile/TurnstileWidget';
import { schedulePersonPage } from '../../config/schedulePerson';
import { submitContribution, SubmitError, type AffiliationType } from './api';
import { useChannelLookup } from './useChannelLookup';
import { ContributePreviewCard } from './ContributePreviewCard';

const NATIONALITIES = ['TW', 'HK', 'MY', 'JP', 'KR', 'OTHER'] as const;
const YT_AVATAR = /^https:\/\/yt3\.(ggpht|googleusercontent)\.com\/[^\s"'<>]+$/;
const HTTP_URL = /^(https?:\/\/)?[^\s/$.?#].[^\s]*$/i;

interface FormValues {
    youtubeUrl: string;
    name: string;
    affiliation: AffiliationType;
    groupName: string;
    nationality: (typeof NATIONALITIES)[number];
    evidenceUrl: string;
    bio: string;
    avatarUrl: string;
    subscribers: string;
    x: string;
    facebook: string;
    instagram: string;
    twitch: string;
    note: string;
    contact: string;
}

const EMPTY: FormValues = {
    youtubeUrl: '',
    name: '',
    affiliation: 'personal',
    groupName: '',
    nationality: 'TW',
    evidenceUrl: '',
    bio: '',
    avatarUrl: '',
    subscribers: '',
    x: '',
    facebook: '',
    instagram: '',
    twitch: '',
    note: '',
    contact: '',
};

function Field({ id, label, required, hint, error, children }: { id: string; label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id} className="text-sm font-medium">
                {label}
                {required && <span className="ml-0.5 text-[#e5173f]" aria-hidden="true">*</span>}
            </Label>
            {children}
            {error ? (
                <p id={`${id}-err`} role="alert" className="text-xs text-destructive">{error}</p>
            ) : hint ? (
                <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 pt-2">
            <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </div>
    );
}

export function ContributeForm({ initialName = '', agencies = [] }: { initialName?: string; agencies?: readonly string[] }) {
    const { t } = useTranslation('schedule');
    const { control, register, handleSubmit, setValue, getValues, reset, formState } = useForm<FormValues>({
        defaultValues: { ...EMPTY, name: initialName },
        mode: 'onTouched',
    });
    const { errors, isSubmitting, dirtyFields } = formState;
    const values = useWatch({ control });
    const lookup = useChannelLookup(values.youtubeUrl ?? '');
    const turnstile = useRef<TurnstileHandle>(null);
    const [token, setToken] = useState<string | null>(null);
    const [serverError, setServerError] = useState<string | null>(null);
    const [existing, setExisting] = useState<{ name: string; slug: string } | null>(null);
    const [done, setDone] = useState<string | null>(null);

    // 查到頻道：名稱、頭像只在使用者還沒自己改過時帶入
    useEffect(() => {
        // 換了頻道（重新查詢或清空）：先拿掉上一個頻道的「已在週表上」提示
        if (lookup.status === 'loading' || lookup.status === 'idle') setExisting(null);
        if (lookup.status !== 'found') return;
        const { channel } = lookup.result;
        if (channel.title && !dirtyFields.name) setValue('name', channel.title, { shouldValidate: true });
        if (channel.avatarUrl && !dirtyFields.avatarUrl) setValue('avatarUrl', channel.avatarUrl);
        setExisting(lookup.result.exists);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lookup]);

    const groupLabel =
        values.affiliation === 'personal' ? t('contribute.affiliation.personal') : (values.groupName || '').trim() || t(`contribute.affiliation.${values.affiliation ?? 'agency'}`);
    const preview = useMemo(
        () => ({
            name: (values.name || '').trim(),
            avatarUrl: (values.avatarUrl || '').trim(),
            groupLabel,
            nationality: values.nationality || 'TW',
            bio: (values.bio || '').trim(),
            subscribers: (values.subscribers || '').trim(),
            hasYoutube: lookup.status === 'found',
            socials: { x: !!values.x?.trim(), facebook: !!values.facebook?.trim(), instagram: !!values.instagram?.trim(), twitch: !!values.twitch?.trim() },
        }),
        [values, groupLabel, lookup.status],
    );

    const onSubmit = async (v: FormValues) => {
        setServerError(null);
        try {
            await submitContribution({
                youtubeUrl: v.youtubeUrl.trim(),
                name: v.name.trim(),
                nationality: v.nationality,
                nationalityEvidenceUrl: v.evidenceUrl.trim() || undefined,
                affiliation: { type: v.affiliation, groupName: v.affiliation === 'personal' ? undefined : v.groupName.trim() },
                bio: v.bio.trim() || undefined,
                avatarUrl: v.avatarUrl.trim() || undefined,
                subscriberCount: v.subscribers.trim() || undefined,
                socials: { x: v.x.trim(), facebook: v.facebook.trim(), instagram: v.instagram.trim(), twitch: v.twitch.trim() },
                note: v.note.trim() || undefined,
                contact: v.contact.trim() || undefined,
                turnstileToken: token,
            });
            setDone(v.name.trim());
        } catch (e) {
            const code = e instanceof SubmitError ? e.code : 'generic';
            if (code === 'exists' && e instanceof SubmitError && e.data?.vtuber) setExisting(e.data.vtuber as { name: string; slug: string });
            setServerError(t(`contribute.error.${code}`, { defaultValue: t('contribute.error.generic') }));
        } finally {
            // token 只能用一次：不論成敗都換新的
            turnstile.current?.reset();
        }
    };

    if (done) {
        return (
            <div role="status" className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-border px-6 py-14 text-center">
                <CheckCircle2 className="size-10 text-emerald-500" aria-hidden="true" />
                <h2 className="text-xl font-bold">{t('contribute.successTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('contribute.successBody', { name: done })}</p>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => {
                            reset(EMPTY);
                            setDone(null);
                            setExisting(null);
                        }}
                    >
                        {t('contribute.successAgain')}
                    </Button>
                    <Button asChild>
                        <RouteLink to="schedule">{t('contribute.backToSchedule')}</RouteLink>
                    </Button>
                </div>
            </div>
        );
    }

    const lookupError = lookup.status === 'error' ? t(`contribute.error.${lookup.code === 'not_found' ? 'youtube_not_found' : lookup.code === 'fetch_failed' ? 'youtube_fetch_failed' : lookup.code}`, { defaultValue: t('contribute.error.youtube_fetch_failed') }) : undefined;
    const needsEvidence = values.nationality !== 'TW';
    const required = { required: t('contribute.required') };
    const maxLen = (max: number) => ({ maxLength: { value: max, message: t('contribute.tooLong', { max }) } });

    return (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5" aria-describedby={serverError ? 'contribute-server-err' : undefined}>
                <SectionHeading>{t('contribute.section.channel')}</SectionHeading>
                <Field
                    id="cf-youtube"
                    label={t('contribute.youtubeUrl')}
                    required
                    error={errors.youtubeUrl?.message || lookupError}
                    hint={lookup.status === 'loading' ? t('contribute.lookingUp') : lookup.status === 'found' && lookup.result.channel.title ? t('contribute.found', { title: lookup.result.channel.title }) : t('contribute.youtubeUrlHint')}
                >
                    <div className="relative">
                        <Input
                            id="cf-youtube"
                            inputMode="url"
                            autoComplete="off"
                            placeholder={t('contribute.youtubeUrlPlaceholder')}
                            aria-invalid={!!(errors.youtubeUrl || lookupError)}
                            {...register('youtubeUrl', { ...required, ...maxLen(300) })}
                        />
                        {lookup.status === 'loading' && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
                    </div>
                </Field>

                {existing && (
                    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                        <AlertTriangle size={16} className="shrink-0 text-amber-500" aria-hidden="true" />
                        <span className="flex-1">
                            {t('contribute.exists', { name: existing.name })}
                            <span className="block text-xs text-muted-foreground">{t('contribute.existsHint')}</span>
                        </span>
                        <RouteLink to={schedulePersonPage(existing.slug)} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
                            {t('contribute.existsAction')}
                            <ExternalLink size={13} aria-hidden="true" />
                        </RouteLink>
                    </div>
                )}
                {!existing && lookup.status === 'found' && lookup.result.pending && (
                    <p role="status" className="rounded-xl border border-border bg-foreground/[0.03] px-4 py-3 text-sm text-muted-foreground">{t('contribute.pending')}</p>
                )}

                <SectionHeading>{t('contribute.section.profile')}</SectionHeading>
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="cf-name" label={t('contribute.name')} required error={errors.name?.message}>
                        <Input id="cf-name" placeholder={t('contribute.namePlaceholder')} aria-invalid={!!errors.name} {...register('name', { ...required, ...maxLen(100) })} />
                    </Field>
                    <Field id="cf-nationality" label={t('contribute.nationality')} required>
                        <Controller
                            control={control}
                            name="nationality"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger id="cf-nationality" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {NATIONALITIES.map((n) => (
                                            <SelectItem key={n} value={n}>
                                                {t(`nationality.${n}`)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </Field>
                </div>
                <p className="-mt-2 text-xs text-muted-foreground">{t('contribute.nationalityHint')}</p>
                {needsEvidence && (
                    <Field id="cf-evidence" label={t('contribute.evidence')} required error={errors.evidenceUrl?.message}>
                        <Input
                            id="cf-evidence"
                            inputMode="url"
                            placeholder={t('contribute.evidencePlaceholder')}
                            aria-invalid={!!errors.evidenceUrl}
                            {...register('evidenceUrl', {
                                validate: (v) => (!getValues('nationality') || getValues('nationality') === 'TW' ? true : !v.trim() ? t('contribute.required') : HTTP_URL.test(v.trim()) || t('contribute.invalidUrl')),
                            })}
                        />
                    </Field>
                )}

                <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">{t('contribute.affiliation')}</legend>
                    <Controller
                        control={control}
                        name="affiliation"
                        render={({ field }) => (
                            <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-wrap gap-x-5 gap-y-2">
                                {(['personal', 'agency', 'circle'] as const).map((a) => (
                                    <label key={a} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                                        <RadioGroupItem value={a} />
                                        {t(`contribute.affiliation.${a}`)}
                                    </label>
                                ))}
                            </RadioGroup>
                        )}
                    />
                </fieldset>
                {values.affiliation !== 'personal' && (
                    <Field id="cf-group" label={t('contribute.groupName')} required error={errors.groupName?.message}>
                        <Input
                            id="cf-group"
                            list="cf-group-options"
                            placeholder={t('contribute.groupNamePlaceholder')}
                            aria-invalid={!!errors.groupName}
                            {...register('groupName', {
                                ...maxLen(100),
                                validate: (v) => getValues('affiliation') === 'personal' || !!v.trim() || t('contribute.required'),
                            })}
                        />
                        <datalist id="cf-group-options">
                            {agencies.map((a) => (
                                <option key={a} value={a} />
                            ))}
                        </datalist>
                    </Field>
                )}

                <Field id="cf-bio" label={t('contribute.bio')} error={errors.bio?.message}>
                    <Textarea id="cf-bio" rows={4} placeholder={t('contribute.bioPlaceholder')} aria-invalid={!!errors.bio} {...register('bio', maxLen(500))} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="cf-avatar" label={t('contribute.avatar')} error={errors.avatarUrl?.message}>
                        <Input
                            id="cf-avatar"
                            inputMode="url"
                            placeholder="https://yt3.googleusercontent.com/…"
                            aria-invalid={!!errors.avatarUrl}
                            {...register('avatarUrl', { validate: (v) => !v.trim() || YT_AVATAR.test(v.trim()) || t('contribute.error.invalid_avatar') })}
                        />
                    </Field>
                    <Field id="cf-subs" label={t('contribute.subscribers')} hint={t('contribute.subscribersHint')} error={errors.subscribers?.message}>
                        <Input id="cf-subs" placeholder={t('contribute.subscribersPlaceholder')} aria-invalid={!!errors.subscribers} {...register('subscribers', maxLen(20))} />
                    </Field>
                </div>

                <SectionHeading>{t('contribute.section.social')}</SectionHeading>
                <div className="grid gap-4 sm:grid-cols-2">
                    {(['x', 'twitch', 'facebook', 'instagram'] as const).map((k) => (
                        <Field key={k} id={`cf-${k}`} label={t(`contribute.social.${k}`)} error={errors[k]?.message}>
                            <Input id={`cf-${k}`} autoComplete="off" placeholder={k === 'facebook' ? 'https://www.facebook.com/…' : k === 'twitch' ? 'twitch.tv/…' : '@…'} {...register(k, maxLen(300))} />
                        </Field>
                    ))}
                </div>

                <SectionHeading>{t('contribute.section.more')}</SectionHeading>
                <Field id="cf-note" label={t('contribute.note')} error={errors.note?.message}>
                    <Textarea id="cf-note" rows={3} placeholder={t('contribute.notePlaceholder')} {...register('note', maxLen(500))} />
                </Field>
                <Field id="cf-contact" label={t('contribute.contact')} hint={t('contribute.contactHint')} error={errors.contact?.message}>
                    <Input id="cf-contact" autoComplete="email" {...register('contact', maxLen(200))} />
                </Field>

                {/* 手機版：預覽放在送出前 */}
                <div className="lg:hidden">
                    <ContributePreviewCard data={preview} />
                </div>

                <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
                    <TurnstileWidget ref={turnstile} onToken={setToken} />
                    <Button type="submit" size="lg" disabled={isSubmitting || token === null || !!existing} className="gap-2 sm:ml-auto">
                        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                        {t(isSubmitting ? 'contribute.submitting' : 'contribute.submit')}
                    </Button>
                </div>
                {serverError && (
                    <p id="contribute-server-err" role="alert" className="text-sm text-destructive">{serverError}</p>
                )}
            </form>

            <div className="hidden lg:block">
                <ContributePreviewCard data={preview} />
            </div>
        </div>
    );
}
