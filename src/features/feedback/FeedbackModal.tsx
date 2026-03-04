import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { X, MessageSquare, Star, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Slider } from '../../components/ui/slider';
import { Checkbox } from '../../components/ui/checkbox';

import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

import { FeedbackFormData } from './FeedbackTypes';
import { FeedbackService, FeedbackPayload } from './FeedbackService';
import packageJson from '../../../package.json';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { logEvent } from '../../utils/analytics';
import { trackEvent as umamiTrack } from '../../utils/umami';

interface FeedbackModalProps {
    theme: 'light' | 'dark';
    onClose: () => void;
}

export function FeedbackModal({ theme, onClose }: FeedbackModalProps) {
    const { t } = useTranslation(['feedback', 'navbar']);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        logEvent('Feedback', 'open_modal');
    }, []);

    const { control, handleSubmit, formState: { errors } } = useForm<FeedbackFormData>({
        defaultValues: {
            source: '',
            usageTime: [],
            usageDuration: '',
            rating: 5,
            feedbackType: 'bug',
            content: '',
            npsScore: undefined,
        }
    });

    const onSubmit = async (data: FeedbackFormData) => {
        setIsSubmitting(true);

        // Auto capture system info
        const systemInfo = {
            userAgent: navigator.userAgent,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            windowSize: `${window.innerWidth}x${window.innerHeight}`,
            theme: theme,
            version: packageJson.version,
        };

        const finalData: FeedbackPayload = {
            ...data,
            ...systemInfo
        };

        try {
            await FeedbackService.sendFeedback(finalData);
            setIsSuccess(true);

            // Auto close after 2 seconds
            setTimeout(() => {
                onClose();
            }, 2000);
            logEvent('Feedback', 'submit_success', finalData.feedbackType);
            umamiTrack('feedback-submit');
        } catch (error) {
            console.error('Submission error');
            alert(t('error'));
            logEvent('Feedback', 'submit_error', error instanceof Error ? error.message : 'unknown');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper styles matching FavoritesManager
    const inputStyle = `flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`;
    const labelStyle = `block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`;
    const sectionStyle = `p-4 rounded-lg border mb-4 ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`;
    const headerStyle = `mb-4 font-semibold text-lg ${theme === 'dark' ? 'text-white' : 'text-gray-900'} flex items-center gap-2`;

    if (isSuccess) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className={`max-w-md w-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-2xl p-8 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300`}>
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {t('successTitle')}
                    </h2>
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {t('successMessage')}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`max-w-2xl w-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-2xl max-h-[90vh] flex flex-col`}>
                {/* Header */}
                <div className={`flex items-center justify-between p-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                            <MessageSquare className="size-6 text-white" />
                        </div>
                        <div>
                            <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('title')}</h2>
                            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                {t('feedback', { ns: 'navbar' })}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className={theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}
                    >
                        <X className="size-5" />
                    </Button>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6">
                    <form id="feedback-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">

                        {/* Part 1: Core Feedback (Moved to Top) */}
                        <div className={sectionStyle}>
                            <div className={headerStyle}>
                                {t('coreFeedback')}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className={labelStyle}>{t('feedbackTypeLabel')}</label>
                                    <Controller
                                        name="feedbackType"
                                        control={control}
                                        rules={{ required: true }}
                                        render={({ field }) => (
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <SelectTrigger className={inputStyle}>
                                                    <SelectValue placeholder={t('required')} />
                                                </SelectTrigger>
                                                <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                                                    {['bug', 'feature', 'ui', 'other'].map(val => (
                                                        <SelectItem key={val} value={val} className={theme === 'dark' ? 'text-white' : 'text-black'}>
                                                            {t(`type.${val}` as any)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>

                                <div>
                                    <label className={labelStyle}>{t('contentLabel')}</label>
                                    <Controller
                                        name="content"
                                        control={control}
                                        rules={{ required: t('required') }}
                                        render={({ field }) => (
                                            <Textarea
                                                {...field}
                                                placeholder={t('contentPlaceholder')}
                                                className={`min-h-[120px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                                            />
                                        )}
                                    />
                                    {errors.content && <span className="text-red-500 text-xs mt-1">{errors.content.message}</span>}
                                </div>
                            </div>
                        </div>

                        {/* Part 2: Basic Survey (Optional) */}
                        <div className={sectionStyle}>
                            <div className={headerStyle}>
                                {t('basicSurvey')}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Source */}
                                <div>
                                    <label className={labelStyle}>{t('sourceLabel')}</label>
                                    <Controller
                                        name="source"
                                        control={control}
                                        render={({ field }) => (
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <SelectTrigger className={inputStyle}>
                                                    <SelectValue placeholder={t('select')} />
                                                </SelectTrigger>
                                                <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                                                    {['discord', 'google', 'friends', 'bahamut', 'instagram', 'threads', 'other'].map(opt => (
                                                        <SelectItem key={opt} value={opt} className={theme === 'dark' ? 'text-white' : 'text-black'}>
                                                            {t(`source.${opt}` as any)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>

                                {/* Usage Duration */}
                                <div>
                                    <label className={labelStyle}>{t('usageDurationLabel')}</label>
                                    <Controller
                                        name="usageDuration"
                                        control={control}
                                        render={({ field }) => (
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <SelectTrigger className={inputStyle}>
                                                    <SelectValue placeholder={t('select')} />
                                                </SelectTrigger>
                                                <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                                                    {[
                                                        'firstTime',
                                                        'oneWeek',
                                                        'oneMonth',
                                                        'halfYear',
                                                        'yearPlus'
                                                    ].map(val => (
                                                        <SelectItem key={val} value={val} className={theme === 'dark' ? 'text-white' : 'text-black'}>
                                                            {t(`usageDuration.${val}` as any)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>

                                {/* Usage Time (Checkbox Multi-select) */}
                                <div className="col-span-1 md:col-span-2">
                                    <label className={labelStyle}>{t('usageTimeLabel')}</label>
                                    <div className="flex flex-wrap gap-4">
                                        <Controller
                                            name="usageTime"
                                            control={control}
                                            render={({ field }) => (
                                                <>
                                                    {['morning', 'afternoon', 'evening', 'lateNight'].map((val) => (
                                                        <div key={val} className="flex items-center">
                                                            <Checkbox
                                                                id={`usage-time-${val}`}
                                                                checked={(field.value || []).includes(val)}
                                                                onCheckedChange={(checked: boolean | 'indeterminate') => {
                                                                    const isChecked = checked === true;
                                                                    const newValue = isChecked
                                                                        ? [...(field.value || []), val]
                                                                        : (field.value || []).filter((v: string) => v !== val);
                                                                    field.onChange(newValue);
                                                                }}
                                                            />
                                                            <label htmlFor={`usage-time-${val}`} className={`ml-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} cursor-pointer`}>
                                                                {t(`usageTime.${val}` as any)}
                                                            </label>
                                                        </div>
                                                    ))}
                                                </>
                                            )}
                                        />
                                    </div>
                                </div>

                                {/* Rating */}
                                <div className="col-span-1 md:col-span-2">
                                    <label className={labelStyle}>{t('ratingLabel')}</label>
                                    <Controller
                                        name="rating"
                                        control={control}
                                        render={({ field }) => (
                                            <div className="flex gap-2">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <button
                                                        key={star}
                                                        type="button"
                                                        onClick={() => field.onChange(star)}
                                                        className={`p-1 transition-colors hover:scale-110 ${star <= (field.value || 0)
                                                            ? 'text-yellow-400'
                                                            : theme === 'dark' ? 'text-gray-600' : 'text-gray-300'
                                                            }`}
                                                    >
                                                        <Star className="w-8 h-8 fill-current" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Part 3: Promotion (Optional) */}
                        <div className={sectionStyle}>
                            <div className={headerStyle}>
                                {t('promotion')}
                            </div>

                            <div>
                                <label className={labelStyle}>{t('npsLabel')}</label>
                                <Controller
                                    name="npsScore"
                                    control={control}
                                    render={({ field }) => (
                                        <div className="px-2 pt-2">
                                            <Slider
                                                value={[typeof field.value === 'number' ? field.value : 0]}
                                                onValueChange={(vals) => field.onChange(vals[0])}
                                                step={1}
                                                min={0}
                                                max={10}
                                                className="py-4"
                                            />
                                        </div>
                                    )}
                                />
                                <div className={`flex justify-between text-xs mt-2 px-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <span>{t('npsLow')}</span>
                                    <span>{t('npsHigh')}</span>
                                </div>
                            </div>
                        </div>

                    </form>
                </div>

                {/* Footer */}
                <div className={`p-4 border-t flex justify-end gap-3 ${theme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'} rounded-b-lg`}>
                    <Button
                        onClick={onClose}
                        variant="outline"
                        disabled={isSubmitting}
                        className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}
                    >
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={handleSubmit(onSubmit)}
                        variant="default"
                        disabled={isSubmitting}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {t('submitting')}
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                {t('submit')}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
