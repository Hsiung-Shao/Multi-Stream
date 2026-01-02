import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, Folder, Tag as TagIcon, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '../ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { Badge } from '../ui/badge';
import { TagPopoverSelector } from '../ui/TagPopoverSelector';
import { TagChip } from '../ui/TagChip';

import type { FavoriteCategory, Tag, FavoriteStream } from '../../features/favorites/types';
import { favoritesService } from '../../features/favorites/FavoritesService';
import { logEvent } from '../../utils/analytics';

interface BulkFavoritesActionsProps {
    selectedIds: string[];
    theme: 'light' | 'dark';
    categories: FavoriteCategory[];
    tags: Tag[];
    favorites: FavoriteStream[]; // Needed to get current tags for append logic
    onClearSelection: () => void;
    onRefresh: () => void;
    showMessage: (type: 'success' | 'error', text: string) => void;
}

export function BulkFavoritesActions({
    selectedIds,
    theme,
    categories,
    tags,
    favorites,
    onClearSelection,
    onRefresh,
    showMessage,
}: BulkFavoritesActionsProps) {
    const { t } = useTranslation(['favorites', 'common', 'tags']);

    const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
    const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);

    const [targetCategory, setTargetCategory] = useState<string>('uncategorized');
    const [targetTags, setTargetTags] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // --- Logic for Batch Set Category ---
    const handleBatchSetCategory = async () => {
        if (selectedIds.length === 0) return;

        setIsProcessing(true);
        let successCount = 0;

        const categoryId = targetCategory === 'uncategorized' ? null : targetCategory;

        // Execute updates
        for (const id of selectedIds) {
            const result = favoritesService.updateFavorite(id, { categoryId });
            if (result.success) successCount++;
        }

        setIsProcessing(false);
        setIsCategoryDialogOpen(false);

        if (successCount > 0) {
            showMessage('success', `${t('common:common.updated')} ${successCount} ${t('myFavorites')}`);
            onClearSelection();
            onRefresh();
            logEvent('Favorites', 'batch_set_category', 'count', successCount);
        } else {
            showMessage('error', t('common:common.error'));
        }
    };

    // --- Logic for Batch Add Tags (Append) ---
    const handleBatchAddTags = async () => {
        if (selectedIds.length === 0) return;
        if (targetTags.length === 0) {
            setIsTagDialogOpen(false);
            return;
        }

        setIsProcessing(true);
        let successCount = 0;

        for (const id of selectedIds) {
            const item = favorites.find(f => f.id === id);
            if (item) {
                // Union existing tags and new tags
                const currentTags = item.tagIds || [];
                const newTagSet = new Set([...currentTags, ...targetTags]);
                const updatedTags = Array.from(newTagSet);

                const result = favoritesService.updateFavorite(id, { tagIds: updatedTags });
                if (result.success) successCount++;
            }
        }

        setIsProcessing(false);
        setIsTagDialogOpen(false);
        setTargetTags([]); // Reset selection

        if (successCount > 0) {
            showMessage('success', `${t('common:common.updated')} ${successCount} ${t('myFavorites')}`);
            onClearSelection();
            onRefresh();
            logEvent('Favorites', 'batch_add_tags', 'count', successCount);
        } else {
            showMessage('error', t('common:common.error'));
        }
    };

    if (selectedIds.length === 0) return null;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}>
                        <Settings2 className="size-4 mr-2" />
                        {t('batchEdit') || '批量編輯'}
                        <Badge variant="secondary" className="ml-2 h-5 px-1.5 min-w-[1.25rem]">
                            {selectedIds.length}
                        </Badge>
                        <ChevronDown className="size-3 ml-2 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300'}>
                    <DropdownMenuLabel>{t('batchOperations') || '批量操作'}</DropdownMenuLabel>
                    <DropdownMenuSeparator className={theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} />
                    <DropdownMenuItem
                        onClick={() => setIsCategoryDialogOpen(true)}
                        className={`cursor-pointer ${theme === 'dark' ? 'focus:bg-gray-800 focus:text-white' : ''}`}
                    >
                        <Folder className="size-4 mr-2" />
                        {t('setCategory') || '設定分類'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => {
                            setTargetTags([]);
                            setIsTagDialogOpen(true);
                        }}
                        className={`cursor-pointer ${theme === 'dark' ? 'focus:bg-gray-800 focus:text-white' : ''}`}
                    >
                        <TagIcon className="size-4 mr-2" />
                        {t('addTags') || '加入標籤'}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Dialog: Set Category */}
            <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                <DialogContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white'}>
                    <DialogHeader>
                        <DialogTitle>{t('setCategory') || '設定分類'}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-gray-500 mb-4">
                            {t('batchSetCategoryConfirm', { count: selectedIds.length }) || `將 ${selectedIds.length} 個項目移動到以下分類：`}
                        </p>
                        <Select value={targetCategory} onValueChange={setTargetCategory}>
                            <SelectTrigger className={theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : ''}>
                                <SelectValue placeholder={t('uncategorized')} />
                            </SelectTrigger>
                            <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : ''}>
                                <SelectItem value="uncategorized">{t('uncategorized')}</SelectItem>
                                {categories.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)} disabled={isProcessing}
                            className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : ''}
                        >
                            {t('common:common.cancel')}
                        </Button>
                        <Button onClick={handleBatchSetCategory} disabled={isProcessing} className="bg-purple-600 hover:bg-purple-700 text-white">
                            {isProcessing && <Loader2 className="size-4 mr-2 animate-spin" />}
                            {t('common:common.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog: Add Tags */}
            <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
                <DialogContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white'}>
                    <DialogHeader>
                        <DialogTitle>{t('addTags') || '加入標籤'}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-gray-500 mb-4">
                            {t('batchAddTagsConfirm', { count: selectedIds.length }) || `為 ${selectedIds.length} 個項目加入以下標籤（附加模式）：`}
                        </p>

                        {/* Tag Selector */}
                        <div className="space-y-3">
                            <TagPopoverSelector
                                allTags={tags}
                                selectedTagIds={targetTags}
                                onChange={setTargetTags}
                                theme={theme}
                                showSelectedChips={false}
                            />

                            {/* Chips Display */}
                            <div className="flex flex-wrap gap-2 min-h-[2rem]">
                                {targetTags.length === 0 && (
                                    <span className="text-sm text-gray-400 italic">{t('tags:noTagsSelected') || '未選擇標籤'}</span>
                                )}
                                {tags.filter(tag => targetTags.includes(tag.id)).map(tag => (
                                    <TagChip
                                        key={tag.id}
                                        tag={tag}
                                        onDelete={() => {
                                            setTargetTags(prev => prev.filter(id => id !== tag.id));
                                        }}
                                        className="cursor-pointer"
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTagDialogOpen(false)} disabled={isProcessing}
                            className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : ''}
                        >
                            {t('common:common.cancel')}
                        </Button>
                        <Button onClick={handleBatchAddTags} disabled={isProcessing || targetTags.length === 0} className="bg-purple-600 hover:bg-purple-700 text-white">
                            {isProcessing && <Loader2 className="size-4 mr-2 animate-spin" />}
                            {t('common:common.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
