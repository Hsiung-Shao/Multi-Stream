import { useForm, Controller } from 'react-hook-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { TagPopoverSelector } from '../../../components/ui/TagPopoverSelector';
import { TagChip } from '../../../components/ui/TagChip';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import type { FavoriteStream, FavoriteCategory as Category, Tag } from '../types';

interface AddFavoriteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: AddFavoriteFormValues) => void;
    categories: Category[];
    allTags: Tag[];
    initialData?: FavoriteStream | null;
    theme: 'light' | 'dark';
}

export interface AddFavoriteFormValues {
    url: string;
    name: string;
    categoryId: string;
    tagIds: string[];
}

export function AddFavoriteDialog({
    open,
    onOpenChange,
    onSubmit,
    categories,
    allTags,
    initialData,
    theme
}: AddFavoriteDialogProps) {
    const { t } = useTranslation(['favorites', 'common', 'tags']);

    const { register, handleSubmit, control, reset, setValue, watch } = useForm<AddFavoriteFormValues>({
        defaultValues: {
            url: '',
            name: '',
            categoryId: 'uncategorized',
            tagIds: []
        }
    });

    const selectedTagIds = watch('tagIds');

    useEffect(() => {
        if (initialData) {
            reset({
                url: initialData.url,
                name: initialData.name,
                categoryId: initialData.categoryId || 'uncategorized',
                tagIds: initialData.tagIds || []
            });
        } else {
            reset({
                url: '',
                name: '',
                categoryId: 'uncategorized',
                tagIds: []
            });
        }
    }, [initialData, reset, open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={`sm:max-w-[500px] ${theme === 'dark' ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white'
                }`}>
                <DialogHeader>
                    <DialogTitle>{initialData ? t('common:common.edit') : t('addFavorite')}</DialogTitle>
                    <DialogDescription>
                        {initialData ? t('subtitle') : t('subtitle')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('pasteUrl')}</label>
                        <Input
                            {...register('url', { required: !initialData })}
                            placeholder="https://www.twitch.tv/..."
                            disabled={!!initialData}
                            className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('customName')}</label>
                        <Input
                            {...register('name')}
                            placeholder={t('customName')}
                            className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('category')}</label>
                            <Controller
                                name="categoryId"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                                            <SelectValue placeholder={t('uncategorized')} />
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

                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('tags:addTag')}</label>
                            <div className="flex gap-2">
                                <Controller
                                    name="tagIds"
                                    control={control}
                                    render={({ field }) => (
                                        <TagPopoverSelector
                                            allTags={allTags}
                                            selectedTagIds={field.value}
                                            onChange={field.onChange}
                                            theme={theme}
                                            showSelectedChips={false}
                                        />
                                    )}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Selected Tags Preview */}
                    {selectedTagIds.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {allTags.filter(tag => selectedTagIds.includes(tag.id)).map(tag => (
                                <TagChip
                                    key={tag.id}
                                    tag={tag}
                                    onDelete={() => {
                                        setValue('tagIds', selectedTagIds.filter(id => id !== tag.id));
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    <DialogFooter className="pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className={theme === 'dark' ? 'border-gray-700 hover:bg-gray-800' : ''}
                        >
                            {t('common:common.cancel')}
                        </Button>
                        <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                            {initialData ? t('common:common.save') : t('common:common.add')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
