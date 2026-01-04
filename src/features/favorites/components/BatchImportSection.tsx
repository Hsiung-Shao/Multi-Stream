import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Textarea } from '../../../components/ui/textarea';
import { Button } from '../../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Loader2, Folder, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { favoritesService } from '../FavoritesService';
import { tagsService } from '../TagsService';
import { logEvent } from '../../../utils/analytics';
import type { FavoriteCategory as Category } from '../types';

interface BatchImportSectionProps {
    theme: 'light' | 'dark';
    categories: Category[];
    onSuccess: () => void;
}

interface BatchImportFormValues {
    urls: string;
    categoryId: string;
}

export function BatchImportSection({ theme, categories, onSuccess }: BatchImportSectionProps) {
    const { t } = useTranslation(['favorites', 'common']);
    const [isImporting, setIsImporting] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    const { register, handleSubmit, control, reset } = useForm<BatchImportFormValues>({
        defaultValues: {
            urls: '',
            categoryId: 'uncategorized'
        }
    });

    const onSubmit = async (data: BatchImportFormValues) => {
        setIsImporting(true);
        const urlList = data.urls
            .split(/[,\n\r]+/)
            .map(url => url.trim())
            .filter(url => url.length > 0);

        if (urlList.length === 0) {
            setIsImporting(false);
            return;
        }

        setProgress({ current: 0, total: urlList.length });
        const categoryId = data.categoryId === 'uncategorized' ? null : data.categoryId;
        let successCount = 0;

        for (let i = 0; i < urlList.length; i++) {
            const url = urlList[i];
            try {
                const result = await favoritesService.addFavorite(url, undefined, categoryId);
                if (result.success) successCount++;
            } catch (e) {
                // Silently fails for individual URLs
            }
            setProgress(p => ({ ...p, current: i + 1 }));
        }

        setIsImporting(false);
        reset();
        tagsService.initializeDefaults();
        logEvent('Favorites', 'batch_import', 'text_input', successCount);
        onSuccess();
    };

    return (
        <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-50 border-gray-200'
            }`}>
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                    <Folder className="size-5" />
                </div>
                <div>
                    <h3 className="text-lg font-bold">{t('batchImport')}</h3>
                    <p className="text-sm text-gray-500">{t('batchImportPlaceholder')?.split('\n')[0]}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                    <Textarea
                        {...register('urls', { required: true })}
                        placeholder={t('batchImportPlaceholder')}
                        className={`min-h-[200px] text-sm resize-none ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'
                            }`}
                        disabled={isImporting}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <Controller
                            name="categoryId"
                            control={control}
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange} disabled={isImporting}>
                                    <SelectTrigger className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}>
                                        <SelectValue placeholder={t('category')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="uncategorized">{t('uncategorized')}</SelectItem>
                                        {categories.map(cat => (
                                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isImporting}
                        className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
                    >
                        {isImporting ? (
                            <>
                                <Loader2 className="size-4 mr-2 animate-spin" />
                                {progress.current} / {progress.total}
                            </>
                        ) : (
                            t('batchImportButton')
                        )}
                    </Button>
                </div>

                {isImporting && (
                    <div className="pt-4 flex items-center gap-2 text-sm text-blue-500 animate-pulse">
                        <AlertCircle className="size-4" />
                        正在處理中，請稍候...
                    </div>
                )}
            </form>
        </div>
    );
}
