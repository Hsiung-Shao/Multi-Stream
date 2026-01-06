import React, { useEffect, useState } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { LayoutPreview } from './LayoutPreview';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Trash2, LayoutGrid, MoreVertical, Edit2, Check, X, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { Input } from '../../components/ui/input';

interface LayoutManagerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const LayoutManagerDialog: React.FC<LayoutManagerDialogProps> = ({ open, onOpenChange }) => {
    const customLayouts = useStreamStore(state => state.customLayouts);
    const deleteCustomLayout = useStreamStore(state => state.deleteCustomLayout);
    const applyCustomLayout = useStreamStore(state => state.applyCustomLayout);
    const renameCustomLayout = useStreamStore(state => state.renameCustomLayout);
    const updateCustomLayoutFromCurrent = useStreamStore(state => state.updateCustomLayoutFromCurrent);
    const loadCustomLayoutsFromBackup = useStreamStore(state => state.loadCustomLayoutsFromBackup);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        if (open) {
            loadCustomLayoutsFromBackup();
        }
    }, [open, loadCustomLayoutsFromBackup]);

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
        const confirmUpdate = window.confirm(`確定要使用目前的畫面配置來覆寫「${name}」嗎？`);
        if (confirmUpdate) {
            await updateCustomLayoutFromCurrent(id);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>布局管理</DialogTitle>
                    <DialogDescription>管理已儲存的自定布局，點擊套用即可變更目前排列。</DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[400px] pr-4">
                    {(!customLayouts || customLayouts.length === 0) ? (
                        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground h-full">
                            <LayoutGrid className="w-12 h-12 mb-4 opacity-50" />
                            <p>尚無自定布局</p>
                            <p className="text-sm mt-2">調整視窗位置後，可將其儲存為模板。</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
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
                                                                重新命名
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleUpdateLayout(layout.id, layout.name)}>
                                                                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                                                                更新為目前布局
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
                                                        title="刪除"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        className="h-8 text-xs"
                                                        onClick={() => {
                                                            applyCustomLayout(layout.id);
                                                            onOpenChange(false);
                                                        }}
                                                    >
                                                        套用
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
            </DialogContent>
        </Dialog>
    );
};
