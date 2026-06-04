import { Play, Edit2, Trash2, Youtube, Twitch, Heart } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { cn } from '../../../components/ui/utils';
import { useTranslation } from 'react-i18next';
import type { FavoriteStream, Tag, FavoriteCategory as Category } from '../types';

interface FavoriteListItemProps {
    favorite: FavoriteStream;
    categories: Category[];
    tags: Tag[];
    isSelected: boolean;
    onSelect: (id: string, checked: boolean) => void;
    onStartEdit: (favorite: FavoriteStream) => void;
    onDelete: (id: string) => void;
    /** 載入到播放器。不傳則不渲染 Play 按鈕(帳號頁純管理用) */
    onLoad?: (id: string) => void;
    /** 顯示「直播中/離線」綠/灰圓點。預設 true,帳號頁傳 false */
    showLiveIndicator?: boolean;
    /** 推薦到推薦頁。不傳則不渲染 Heart 按鈕(僅 canvas FavoritesManagerMain 提供) */
    onRecommend?: (favorite: FavoriteStream) => void;
}

export function FavoriteListItem({
    favorite,
    categories,
    tags,
    isSelected,
    onSelect,
    onStartEdit,
    onDelete,
    onLoad,
    showLiveIndicator = true,
    onRecommend,
}: FavoriteListItemProps) {
    const { t } = useTranslation(['favorites', 'common']);
    const category = categories.find(c => c.id === favorite.categoryId);
    const itemTags = tags.filter(tag => favorite.tagIds?.includes(tag.id));

    return (
        <div className="p-3 rounded-xl border border-border bg-card hover:border-purple-500/40 transition-all duration-200 group flex items-center gap-3">
            <Checkbox
                checked={isSelected}
                onCheckedChange={(checked: boolean | 'indeterminate') => onSelect(favorite.id, !!checked)}
                className="border-border data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
            />

            {/* Platform Icon */}
            <div className="flex-shrink-0">
                {favorite.platform === 'twitch' ? (
                    <div className="size-7 rounded-lg flex items-center justify-center bg-purple-500/10 text-[#9146ff]">
                        <Twitch className="size-4" />
                    </div>
                ) : (
                    <div className="size-7 rounded-lg flex items-center justify-center bg-red-500/10 text-[#FF0000]">
                        <Youtube className="size-4" />
                    </div>
                )}
            </div>

            {/* Live Indicator */}
            {showLiveIndicator && favorite.isLive !== null && (
                <div
                    className={`w-2 h-2 rounded-full ring-4 ${favorite.isLive === true
                        ? 'bg-green-500 ring-green-500/20 animate-pulse'
                        : 'bg-muted-foreground/60 ring-muted-foreground/15'
                        }`}
                    title={favorite.isLive === true ? t('live') : t('offline')}
                />
            )}

            {/* Stream Info */}
            <div className="flex-1 min-w-0">
                <div className="font-semibold truncate text-foreground">
                    {favorite.name}
                </div>
                <div className="flex items-center gap-1.5 text-xs mt-1 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {category?.name || t('uncategorized')}
                    </span>
                    {/* Tags Display */}
                    {itemTags.map(tag => (
                        <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{
                                backgroundColor: `${tag.color}1a`,
                                color: tag.color,
                                border: `1px solid ${tag.color}33`,
                            }}
                        >
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                        </span>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onStartEdit(favorite)}
                    title={t('common:common.edit')}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                    <Edit2 className="size-4" />
                </Button>
                {onLoad && (
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onLoad(favorite.id)}
                        title={t('addStream')}
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-purple-500 hover:bg-purple-500/10 dark:hover:text-purple-400"
                    >
                        <Play className="size-4" />
                    </Button>
                )}
                {onRecommend && (favorite.platform === 'twitch' || favorite.platform === 'youtube') && (
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onRecommend(favorite)}
                        title={favorite.recommendedAt ? '已推薦過' : '推薦給社群'}
                        disabled={!!favorite.recommendedAt}
                        aria-pressed={!!favorite.recommendedAt}
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10 dark:hover:text-pink-400 disabled:opacity-100 disabled:cursor-default"
                    >
                        <Heart className={cn('size-4', favorite.recommendedAt && 'fill-current text-rose-500')} />
                    </Button>
                )}
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(favorite.id)}
                    title={t('delete')}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 dark:hover:text-red-400"
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
        </div>
    );
}
