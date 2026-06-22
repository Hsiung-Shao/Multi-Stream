import { useEffect, useState } from 'react';
import { useStreamStore } from '../../../store/useStreamStore';
import { LayoutPreview } from '../../../components/Layout/LayoutPreview';
import { Button } from '../../../components/ui/button';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Trash2, LayoutGrid, MoreVertical, Edit2, Check, X, RefreshCw } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { Input } from '../../../components/ui/input';
import { useTranslation } from 'react-i18next';

export const LayoutManagerSection = () => {
    const { t } = useTranslation(['common', 'favorites']);
    const customLayouts = useStreamStore(state => state.customLayouts);
    const deleteCustomLayout = useStreamStore(state => state.deleteCustomLayout);
    const applyCustomLayout = useStreamStore(state => state.applyCustomLayout);
    const renameCustomLayout = useStreamStore(state => state.renameCustomLayout);
    const updateCustomLayoutFromCurrent = useStreamStore(state => state.updateCustomLayoutFromCurrent);
    const loadCustomLayoutsFromBackup = useStreamStore(state => state.loadCustomLayoutsFromBackup);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        loadCustomLayoutsFromBackup();
    }, [loadCustomLayoutsFromBackup]);

    const startEditing = (id: string, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditName('');
    };

    const saveEditing = async (id: string) => {
        if (editName.trim()) {
            await renameCustomLayout(id, editName.trim());
        }
        setEditingId(null);
        setEditName('');
    };

    const handleUpdateLayout = async (id: string, name: string) => {
        const confirmUpdate = window.confirm(t('favorites:layout_manager.confirm_update', { name }));
        if (confirmUpdate) {
            await updateCustomLayoutFromCurrent(id);
        }
    };

    return (
        <div className="flex-1 flex flex-col gap-6 max-w-4xl mx-auto w-full py-4 px-2 overflow-hidden h-full">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                    <LayoutGrid className="size-5" />
                </div>
                <h3 className="text-lg font-bold font-normal text-foreground">{t('common.manage_layouts')}</h3>
            </div>

            <div className="flex-1 min-h-0 rounded-xl border border-border bg-muted/30 overflow-hidden">
                <ScrollArea className="h-full">
                    {(!customLayouts || customLayouts.length === 0) ? (
                        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground min-h-[300px]">
                            <LayoutGrid className="w-12 h-12 mb-4 opacity-50" />
                            <p>{t('favorites:layout_manager.no_layouts')}</p>
                            <p className="text-sm mt-2">{t('favorites:layout_manager.no_layouts_desc')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
                            {customLayouts.map(layout => (
                                <div key={layout.id} className="border rounded-lg p-3 bg-card hover:bg-accent/50 transition-colors group relative flex flex-col gap-2">
                                    <LayoutPreview slots={layout.slots} className="bg-background" />

                                    <div className="flex items-center justify-between mt-1 h-8">
                                        {editingId === layout.id ? (
                                            <div className="flex items-center gap-1 w-full">
                                                <Input
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="h-7 text-sm px-2 py-1"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') saveEditing(layout.id);
                                                        if (e.key === 'Escape') cancelEditing();
                                                    }}
                                                />
                                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500 hover:text-green-600 hover:bg-green-100/10" onClick={() => saveEditing(layout.id)}>
                                                    <Check className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-100/10" onClick={cancelEditing}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-1 overflow-hidden">
                                                    <span className="font-medium truncate text-sm" title={layout.name}>{layout.name}</span>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <MoreVertical className="h-3 w-3" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="start">
                                                            <DropdownMenuItem onClick={() => startEditing(layout.id, layout.name)}>
                                                                <Edit2 className="h-3.5 w-3.5 mr-2" />
                                                                {t('favorites:layout_manager.rename')}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleUpdateLayout(layout.id, layout.name)}>
                                                                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                                                                {t('favorites:layout_manager.update_from_current')}
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                        onClick={() => deleteCustomLayout(layout.id)}
                                                        title={t('favorites:layout_manager.delete_confirm')}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        className="h-8 text-xs"
                                                        onClick={() => {
                                                            applyCustomLayout(layout.id);
                                                        }}
                                                    >
                                                        {t('favorites:layout_manager.apply')}
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>
        </div>
    );
};
