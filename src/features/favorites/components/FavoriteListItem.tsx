import { Play, Edit2, Trash2, Youtube } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import type { FavoriteStream, Tag, FavoriteCategory as Category } from '../types';

/** Twitch 品牌實心 icon(對齊設計 FMRow 的 BrandTwitch,非 lucide 線框版) */
function BrandTwitch({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
            <path d="M2.149 0L.523 4.119v15.36h5.731V22h3.224l2.539-2.521h4.064L23.477 13.165V0H2.149zM21.176 12.067l-3.825 3.802h-3.825l-2.539 2.522v-2.522h-4.359V2.057h14.548v10.01z M19.149 5.529h-2.244v6.539h2.244V5.529z M13.298 5.529h-2.244v6.539h2.244V5.529z" />
        </svg>
    );
}

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
}: FavoriteListItemProps) {
    const { t } = useTranslation(['favorites', 'common']);
    const category = categories.find(c => c.id === favorite.categoryId);
    // 顯示收藏的所有標籤(含平台 tag Twitch/YouTube,使用者要求平台 tag 也要看得到)
    const itemTags = tags.filter(tag => favorite.tagIds?.includes(tag.id));
    const isYouTube = favorite.platform === 'youtube';

    return (
        <div className="p-3 rounded-xl border border-border bg-card hover:border-purple-500/40 transition-all duration-200 group flex items-center gap-3">
            <Checkbox
                checked={isSelected}
                onCheckedChange={(checked: boolean | 'indeterminate') => onSelect(favorite.id, !!checked)}
                className="border-border data-[state=checked]:bg-[#9333ea] data-[state=checked]:border-[#9333ea] data-[state=checked]:text-white"
            />

            {/* Platform Icon — 28x28 品牌色塊方框(對齊設計 FMRow) */}
            <div className="flex-shrink-0">
                {isYouTube ? (
                    <div
                        className="size-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#FF0000' }}
                    >
                        <Youtube className="size-3.5" />
                    </div>
                ) : (
                    <div
                        className="size-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#9146FF' }}
                    >
                        <BrandTwitch className="size-3.5" />
                    </div>
                )}
            </div>

            {/* Live Indicator — 8x8 圓點 + 光環 + pulse(對齊設計 FMRow) */}
            {showLiveIndicator && favorite.isLive !== null && (
                <div
                    className={`size-2 rounded-full flex-shrink-0 ${favorite.isLive === true ? 'animate-pulse' : ''}`}
                    style={{
                        background: favorite.isLive === true ? '#10b981' : '#6b7280',
                        boxShadow: favorite.isLive === true
                            ? '0 0 0 4px rgba(16,185,129,0.15)'
                            : '0 0 0 4px rgba(107,114,128,0.15)',
                    }}
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
                        className="h-8 w-8 rounded-lg text-[#c084fc] hover:text-[#c084fc] hover:bg-purple-500/10"
                    >
                        <Play className="size-4" />
                    </Button>
                )}
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(favorite.id)}
                    title={t('delete')}
                    className="h-8 w-8 rounded-lg text-[#f87171] hover:text-[#f87171] hover:bg-red-500/10"
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
        </div>
    );
}
