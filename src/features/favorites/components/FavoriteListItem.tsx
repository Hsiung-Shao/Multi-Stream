import { Play, Edit2, Trash2, Youtube, Gamepad2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { TagList } from '../../../components/ui/TagList';
import { useTranslation } from 'react-i18next';
import type { FavoriteStream, Tag, FavoriteCategory as Category } from '../types';

interface FavoriteListItemProps {
    favorite: FavoriteStream;
    categories: Category[];
    tags: Tag[];
    theme: 'light' | 'dark';
    isSelected: boolean;
    onSelect: (id: string, checked: boolean) => void;
    onStartEdit: (favorite: FavoriteStream) => void;
    onDelete: (id: string) => void;
    onLoad: (id: string) => void;
}

export function FavoriteListItem({
    favorite,
    categories,
    tags,
    theme,
    isSelected,
    onSelect,
    onStartEdit,
    onDelete,
    onLoad
}: FavoriteListItemProps) {
    const { t } = useTranslation(['favorites', 'common']);
    const category = categories.find(c => c.id === favorite.categoryId);

    return (
        <div className={`p-3 rounded-xl border transition-all duration-200 group ${theme === 'dark'
                ? 'bg-gray-900/40 border-gray-800 hover:border-purple-500/50 hover:bg-gray-800/60'
                : 'bg-white border-gray-200 hover:border-purple-500/50 hover:shadow-md'
            } flex items-center gap-3`}>
            <Checkbox
                checked={isSelected}
                onCheckedChange={(checked: boolean | 'indeterminate') => onSelect(favorite.id, !!checked)}
                className={theme === 'dark'
                    ? 'border-gray-600 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500'
                    : 'border-gray-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600'
                }
            />

            {/* Platform Icon */}
            <div className="flex-shrink-0">
                {favorite.platform === 'twitch' ? (
                    <div className="p-1.5 rounded-lg bg-purple-500/10 text-[#9146ff]">
                        <Gamepad2 className="size-4" />
                    </div>
                ) : (
                    <div className="p-1.5 rounded-lg bg-red-500/10 text-[#FF0000]">
                        <Youtube className="size-4" />
                    </div>
                )}
            </div>

            {/* Live Indicator */}
            {favorite.isLive !== null && (
                <div
                    className={`w-2 h-2 rounded-full ring-4 ${favorite.isLive === true
                            ? 'bg-green-500 ring-green-500/20 animate-pulse'
                            : 'bg-gray-500 ring-gray-500/20'
                        }`}
                    title={favorite.isLive === true ? t('live') : t('offline')}
                />
            )}

            {/* Stream Info */}
            <div className="flex-1 min-w-0">
                <div className={`font-semibold truncate ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                    {favorite.name}
                </div>
                <div className="flex items-center gap-2 text-xs mt-1 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full ${theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'
                        }`}>
                        {category?.name || t('uncategorized')}
                    </span>
                    {/* Tags Display */}
                    {favorite.tagIds && favorite.tagIds.length > 0 && (
                        <TagList
                            tags={tags.filter(t => favorite.tagIds?.includes(t.id))}
                        />
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onStartEdit(favorite)}
                    title={t('common:common.edit')}
                    className={`h-8 w-8 rounded-lg ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-black hover:bg-gray-100'}`}
                >
                    <Edit2 className="size-4" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onLoad(favorite.id)}
                    title={t('addStream')}
                    className={`h-8 w-8 rounded-lg ${theme === 'dark' ? 'text-gray-400 hover:text-purple-400 hover:bg-purple-500/10' : 'text-gray-500 hover:text-purple-600 hover:bg-purple-50'}`}
                >
                    <Play className="size-4" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(favorite.id)}
                    title={t('delete')}
                    className={`h-8 w-8 rounded-lg ${theme === 'dark' ? 'text-gray-400 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-500 hover:text-red-600 hover:bg-red-50'}`}
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
        </div>
    );
}
