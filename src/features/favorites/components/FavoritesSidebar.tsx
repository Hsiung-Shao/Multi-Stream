import { Star, Folder, Settings, LayoutGrid, FilePlus, ChevronDown, ChevronRight, Hash, Database, Twitch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/badge';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '../../../components/ui/collapsible';
import { useState } from 'react';
import type { FavoriteCategory as Category, Tag } from '../types';
import { ScrollArea } from '../../../components/ui/scroll-area';

interface FavoritesSidebarProps {
    theme: 'light' | 'dark';
    categories: Category[];
    tags: Tag[];
    favoritesCount: number;
    activeFilter: string; // 'all' | 'live' | categoryId | 'tag:tagId'
    onFilterChange: (filter: string) => void;
    onNavigate: (tab: string) => void;
    onAddCategory: () => void;
    activeTab: string;
}

export function FavoritesSidebar({
    theme,
    categories,
    tags,
    favoritesCount,
    activeFilter,
    onFilterChange,
    onNavigate,
    activeTab
}: FavoritesSidebarProps) {
    const { t } = useTranslation(['favorites', 'common', 'tags']);
    const [isTagsOpen, setIsTagsOpen] = useState(true);

    const sectionClass = `space-y-1 mb-6`;
    const labelClass = `px-3 text-[10px] font-bold uppercase tracking-wider mb-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`;

    const navItemClass = (isActive: boolean) => `
    flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 group
    ${isActive
            ? (theme === 'dark' ? 'bg-purple-500/10 text-purple-400 font-medium' : 'bg-purple-50 text-purple-600 font-medium')
            : (theme === 'dark' ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-100 hover:text-black')
        }
  `;

    return (
        <div className={`w-64 h-full border-r flex flex-col ${theme === 'dark' ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-50/50 border-gray-200'
            }`}>
            <ScrollArea className="flex-1">
                <div className="p-4">
                    {/* Primary Navigation */}
                    <div className={sectionClass}>
                        <div className={labelClass}>{t('navigation')}</div>
                        <div
                            className={navItemClass(activeTab === 'favorites' && !activeFilter.startsWith('tag:'))}
                            onClick={() => { onNavigate('favorites'); onFilterChange('all'); }}
                        >
                            <div className="flex items-center gap-3">
                                <LayoutGrid className="size-4" />
                                <span className="text-sm">{t('myFavorites')}</span>
                            </div>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {favoritesCount}
                            </Badge>
                        </div>
                        <div
                            className={navItemClass(activeTab === 'batch')}
                            onClick={() => onNavigate('batch')}
                        >
                            <div className="flex items-center gap-3">
                                <FilePlus className="size-4" />
                                <span className="text-sm">{t('batchImport')}</span>
                            </div>
                        </div>

                        {/* Twitch Import */}
                        <div
                            className={navItemClass(activeTab === 'twitch_import')}
                            onClick={() => onNavigate('twitch_import')}
                        >
                            <div className="flex items-center gap-3">
                                <Twitch className="size-4" />
                                <span className="text-sm">{t('twitchIntegration') || 'Twitch 匯入'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Quick Filters */}
                    <div className={sectionClass}>
                        <div className={labelClass}>{t('tags:filterTitle') || '過濾'}</div>
                        <div
                            className={navItemClass(activeFilter === 'all' && activeTab === 'favorites')}
                            onClick={() => { onNavigate('favorites'); onFilterChange('all'); }}
                        >
                            <div className="flex items-center gap-3">
                                <Star className="size-4" />
                                <span className="text-sm">{t('all')}</span>
                            </div>
                        </div>
                        <div
                            className={navItemClass(activeFilter === 'live')}
                            onClick={() => { onNavigate('favorites'); onFilterChange('live'); }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="size-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-sm">{t('tags:isLive') || '正在直播'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Categories */}
                    <div className={sectionClass}>
                        <div className="flex items-center justify-between px-3 mb-2 group">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{t('categoryManagement')}</span>
                        </div>
                        <div className="space-y-1">
                            {categories.map(cat => (
                                <div
                                    key={cat.id}
                                    className={navItemClass(activeFilter === cat.id)}
                                    onClick={() => { onNavigate('favorites'); onFilterChange(cat.id); }}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Folder className="size-3.5 text-gray-400 group-hover:text-purple-400 transition-colors" />
                                        <span className="text-sm truncate">{cat.name}</span>
                                    </div>
                                </div>
                            ))}
                            {categories.length === 0 && (
                                <div className="px-3 text-xs text-gray-500 italic py-2">
                                    {t('noCategories')}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tags (Collapsible) */}
                    <Collapsible
                        open={isTagsOpen}
                        onOpenChange={setIsTagsOpen}
                        className={sectionClass}
                    >
                        <CollapsibleTrigger className="flex items-center justify-between w-full group py-1 cursor-pointer">
                            <div className={labelClass.replace('mb-2', 'mb-0')}>{t('tags:tagList') || '標籤列表'}</div>
                            {isTagsOpen ? (
                                <ChevronDown className="size-3 text-gray-500 group-hover:text-gray-300" />
                            ) : (
                                <ChevronRight className="size-3 text-gray-500 group-hover:text-gray-300" />
                            )}
                        </CollapsibleTrigger>

                        <CollapsibleContent className="space-y-1 mt-2 animate-in slide-in-from-top-2">
                            {tags.length > 0 ? (
                                tags.map(tag => {
                                    const isSelected = activeFilter === `tag:${tag.id}`;
                                    return (
                                        <div
                                            key={tag.id}
                                            className={navItemClass(isSelected)}
                                            // Make sure we select 'favorites' tab when filtering by tag
                                            onClick={() => { onNavigate('favorites'); onFilterChange(`tag:${tag.id}`); }}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div
                                                    className="size-2 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: tag.color }}
                                                />
                                                <span className="text-sm truncate">{tag.name}</span>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="px-3 text-xs text-gray-500 italic py-2">
                                    {t('tags:noTagsFound') || '沒有標籤'}
                                </div>
                            )}
                        </CollapsibleContent>
                    </Collapsible>
                </div>
            </ScrollArea>

            {/* Footer / System */}
            <div className="mt-auto p-4 pt-4 border-t border-gray-800 space-y-1">
                <div className={navItemClass(activeTab === 'layouts')} onClick={() => onNavigate('layouts')}>
                    <div className="flex items-center gap-3">
                        <LayoutGrid className="size-4" />
                        <span className="text-sm">{t('common:common.manage_layouts')}</span>
                    </div>
                </div>
                <div className={navItemClass(activeTab === 'categories')} onClick={() => onNavigate('categories')}>
                    <div className="flex items-center gap-3">
                        <Folder className="size-4" />
                        <span className="text-sm">{t('manageCategories') || '分類管理'}</span>
                    </div>
                </div>
                <div className={navItemClass(activeTab === 'tags')} onClick={() => onNavigate('tags')}>
                    <div className="flex items-center gap-3">
                        <Hash className="size-4" />
                        <span className="text-sm">{t('tags:addTag') || '標籤管理'}</span>
                    </div>
                </div>
                <div className={navItemClass(activeTab === 'global_settings')} onClick={() => onNavigate('global_settings')}>
                    <div className="flex items-center gap-3">
                        <Settings className="size-4" />
                        <span className="text-sm">{t('settings') || '設定'}</span>
                    </div>
                </div>
                <div className={navItemClass(activeTab === 'backup')} onClick={() => onNavigate('backup')}>
                    <div className="flex items-center gap-3">
                        <Database className="size-4" />
                        <span className="text-sm">{t('backup')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
