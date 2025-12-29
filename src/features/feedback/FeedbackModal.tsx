import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { X, MessageSquare, Star, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { Button as MuiButton, Slider, Checkbox } from '@mui/material';

import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

import { FeedbackFormData } from './FeedbackTypes';
import { FeedbackService, FeedbackPayload } from './FeedbackService';
import packageJson from '../../../package.json';
import { useI18n } from '../../i18n';

interface FeedbackModalProps {
    theme: 'light' | 'dark';
    onClose: () => void;
}

export function FeedbackModal({ theme, onClose }: FeedbackModalProps) {
    const { t } = useI18n();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

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
        } catch (error) {
            console.error('Submission error:', error);
            alert(t('feedback.error'));
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
                        {t('feedback.successTitle')}
                    </h2>
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {t('feedback.successMessage')}
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
                            <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('feedback.title')}</h2>
                            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                {t('navbar.feedback')}
                            </p>
                        </div>
                    </div>
                    <MuiButton
                        variant="text"
                        size="small"
                        onClick={onClose}
                        color="secondary"
                        sx={{
                            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
                            '&:hover': {
                                color: theme === 'dark' ? '#ffffff' : '#000000',
                                backgroundColor: 'transparent',
                            },
                        }}
                    >
                        <X className="size-5" />
                    </MuiButton>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6">
                    <form id="feedback-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">

                        {/* Part 1: Basic Survey */}
                        <div className={sectionStyle}>
                            <div className={headerStyle}>
                                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded ${theme === 'dark' ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'}`}>
                                    {t('feedback.part1')}
                                </span>
                                {t('feedback.basicSurvey')}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Source */}
                                <div>
                                    <label className={labelStyle}>{t('feedback.sourceLabel')}</label>
                                    <Controller
                                        name="source"
                                        control={control}
                                        rules={{ required: true }}
                                        render={({ field }) => (
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <SelectTrigger className={inputStyle}>
                                                    <SelectValue placeholder={t('feedback.required')} />
                                                </SelectTrigger>
                                                <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                                                    {['discord', 'google', 'friends', 'bahamut', 'instagram', 'threads', 'other'].map(opt => (
                                                        <SelectItem key={opt} value={opt} className={theme === 'dark' ? 'text-white' : 'text-black'}>
                                                            {t(`feedback.source.${opt}` as any)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                    {errors.source && <span className="text-red-500 text-xs mt-1">{t('feedback.required')}</span>}
                                </div>

                                {/* Usage Duration */}
                                <div>
                                    <label className={labelStyle}>{t('feedback.usageDurationLabel')}</label>
                                    <Controller
                                        name="usageDuration"
                                        control={control}
                                        rules={{ required: true }}
                                        render={({ field }) => (
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <SelectTrigger className={inputStyle}>
                                                    <SelectValue placeholder={t('feedback.required')} />
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
                                                            {t(`feedback.usageDuration.${val}` as any)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                    {errors.usageDuration && <span className="text-red-500 text-xs mt-1">{t('feedback.required')}</span>}
                                </div>

                                {/* Usage Time (Checkbox Multi-select) */}
                                <div className="col-span-1 md:col-span-2">
                                    <label className={labelStyle}>{t('feedback.usageTimeLabel')}</label>
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
                                                                onChange={(e) => {
                                                                    const newValue = e.target.checked
                                                                        ? [...(field.value || []), val]
                                                                        : (field.value || []).filter((v: string) => v !== val);
                                                                    field.onChange(newValue);
                                                                }}
                                                                sx={{
                                                                    color: theme === 'dark' ? '#9ca3af' : '#4b5563',
                                                                    '&.Mui-checked': {
                                                                        color: theme === 'dark' ? '#3b82f6' : '#2563eb', // Blue
                                                                    },
                                                                }}
                                                            />
                                                            <label htmlFor={`usage-time-${val}`} className={`ml-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} cursor-pointer`}>
                                                                {t(`feedback.usageTime.${val}` as any)}
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
                                    <label className={labelStyle}>{t('feedback.ratingLabel')}</label>
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
                                                        className={`p-1 transition-colors hover:scale-110 ${star <= field.value
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

                        {/* Part 2: Core Feedback */}
                        <div className={sectionStyle}>
                            <div className={headerStyle}>
                                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded ${theme === 'dark' ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-800'}`}>
                                    {t('feedback.part2')}
                                </span>
                                {t('feedback.coreFeedback')}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className={labelStyle}>{t('feedback.feedbackTypeLabel')}</label>
                                    <Controller
                                        name="feedbackType"
                                        control={control}
                                        rules={{ required: true }}
                                        render={({ field }) => (
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <SelectTrigger className={inputStyle}>
                                                    <SelectValue placeholder={t('feedback.required')} />
                                                </SelectTrigger>
                                                <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                                                    {['bug', 'feature', 'ui', 'other'].map(val => (
                                                        <SelectItem key={val} value={val} className={theme === 'dark' ? 'text-white' : 'text-black'}>
                                                            {t(`feedback.type.${val}` as any)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>

                                <div>
                                    <label className={labelStyle}>{t('feedback.contentLabel')}</label>
                                    <Controller
                                        name="content"
                                        control={control}
                                        rules={{ required: t('feedback.required') }}
                                        render={({ field }) => (
                                            <Textarea
                                                {...field}
                                                placeholder={t('feedback.contentPlaceholder')}
                                                className={`min-h-[120px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                                            />
                                        )}
                                    />
                                    {errors.content && <span className="text-red-500 text-xs mt-1">{errors.content.message}</span>}
                                </div>
                            </div>
                        </div>

                        {/* Part 3: Promotion */}
                        <div className={sectionStyle}>
                            <div className={headerStyle}>
                                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded ${theme === 'dark' ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800'}`}>
                                    {t('feedback.part3')}
                                </span>
                                {t('feedback.promotion')}
                            </div>

                            <div>
                                <label className={labelStyle}>{t('feedback.npsLabel')}</label>
                                <Controller
                                    name="npsScore"
                                    control={control}
                                    rules={{ required: true }}
                                    render={({ field }) => (
                                        <div className="px-2 pt-2">
                                            <Slider
                                                value={typeof field.value === 'number' ? field.value : 0}
                                                onChange={(_, value) => field.onChange(value)}
                                                step={1}
                                                marks={[
                                                    { value: 0, label: '0' },
                                                    { value: 10, label: '10' },
                                                ]}
                                                min={0}
                                                max={10}
                                                valueLabelDisplay="auto"
                                                sx={{
                                                    color: theme === 'dark' ? '#3b82f6' : '#2563eb', // Blue
                                                    '& .MuiSlider-markLabel': {
                                                        color: theme === 'dark' ? '#9ca3af' : '#4b5563',
                                                    },
                                                    '& .MuiSlider-valueLabel': {
                                                        backgroundColor: theme === 'dark' ? '#3b82f6' : '#2563eb',
                                                    }
                                                }}
                                            />
                                        </div>
                                    )}
                                />
                                <div className={`flex justify-between text-xs mt-2 px-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <span>{t('feedback.npsLow')}</span>
                                    <span>{t('feedback.npsHigh')}</span>
                                </div>
                                {errors.npsScore && <span className="text-red-500 text-xs mt-1">{t('feedback.selectScore')}</span>}
                            </div>
                        </div>

                    </form>
                </div>

                {/* Footer */}
                <div className={`p-4 border-t flex justify-end gap-3 ${theme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'} rounded-b-lg`}>
                    <MuiButton
                        onClick={onClose}
                        variant="outlined"
                        color="secondary"
                        disabled={isSubmitting}
                        sx={{
                            borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
                            color: theme === 'dark' ? '#d1d5db' : '#374151',
                            '&:hover': {
                                borderColor: theme === 'dark' ? '#4b5563' : '#9ca3af',
                            },
                        }}
                    >
                        {t('feedback.cancel')}
                    </MuiButton>
                    <MuiButton
                        onClick={handleSubmit(onSubmit)}
                        variant="contained"
                        color="secondary"
                        disabled={isSubmitting}
                        sx={{
                            bgcolor: '#2563eb', // Blue
                            '&:hover': { bgcolor: '#1d4ed8' },
                        }}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {t('feedback.submitting')}
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                {t('feedback.submit')}
                            </>
                        )}
                    </MuiButton>
                </div>
            </div>
        </div>
    );
}
