import { Search, Trash2, CheckSquare, Square, Play, Plus } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useTranslation } from 'react-i18next';

interface FavoritesToolbarProps {
    theme: 'light' | 'dark';
    searchQuery: string;
    onSearchChange: (query: string) => void;
    selectedCount: number;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onBatchDelete: () => void;
    onBatchLoad: () => void;
    onAddNew: () => void;
}

export function FavoritesToolbar({
    theme,
    searchQuery,
    onSearchChange,
    selectedCount,
    onSelectAll,
    onDeselectAll,
    onBatchDelete,
    onBatchLoad,
    onAddNew
}: FavoritesToolbarProps) {
    const { t } = useTranslation(['favorites', 'common']);

    return (
        <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 size-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                        }`} />
                    <Input
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder={t('favorites:placeholder.search_url')}
                        className={`pl-10 ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-100/50 border-gray-200'
                            }`}
                    />
                </div>
                <Button
                    onClick={onAddNew}
                    className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20"
                >
                    <Plus className="size-4 mr-2" />
                    {t('addFavorite')}
                </Button>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectedCount > 0 ? onDeselectAll : onSelectAll}
                        className={`text-xs ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black'}`}
                    >
                        {selectedCount > 0 ? (
                            <><Square className="size-3 mr-1.5" />{t('deselectAll')}</>
                        ) : (
                            <><CheckSquare className="size-3 mr-1.5" />{t('selectAll')}</>
                        )}
                    </Button>

                    {selectedCount > 0 && (
                        <span className={`text-xs font-medium ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                            已選擇 {selectedCount} 項
                        </span>
                    )}
                </div>

                {selectedCount > 0 && (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onBatchLoad}
                            className={`h-8 text-xs ${theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300'
                                }`}
                        >
                            <Play className="size-3 mr-1.5" />
                            {t('loadSelected')}
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={onBatchDelete}
                            className="h-8 text-xs"
                        >
                            <Trash2 className="size-3 mr-1.5" />
                            {t('delete')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
