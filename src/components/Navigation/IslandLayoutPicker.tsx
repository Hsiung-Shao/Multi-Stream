import React, { useState } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { LayoutGrid, Save, ArrowUpRight, Settings, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SaveLayoutDialog } from '../../components/Layout/SaveLayoutDialog';
import { cn } from '../ui/utils';
import { useUIStore } from '../../store/useUIStore';

interface IslandLayoutPickerProps {
    isExpanded: boolean;
    onMouseLeave?: () => void;
    onOpenSettings: () => void;
}

export const IslandLayoutPicker = ({ isExpanded, onMouseLeave, onOpenSettings }: IslandLayoutPickerProps) => {
    const { t } = useTranslation(['common', 'favorites']);
    const customLayouts = useStreamStore(state => state.customLayouts);
    const applyCustomLayout = useStreamStore(state => state.applyCustomLayout);

    const [saveDialogOpen, setSaveDialogOpen] = useState(false);

    return (
        <>
            <div
                onMouseLeave={onMouseLeave}
                className={cn(
                    "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[320px] bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-500 ease-out origin-bottom",
                    isExpanded
                        ? "opacity-100 scale-100 translate-y-0"
                        : "opacity-0 scale-95 translate-y-4 pointer-events-none"
                )}
            >
                <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-white text-sm font-medium flex items-center gap-2">
                            <LayoutGrid className="size-4 text-purple-400" />
                            {t('common.layout_list') || '布局清單'}
                        </h3>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-white hover:bg-white/10"
                            onClick={onOpenSettings}
                        >
                            <Settings className="size-3.5 mr-1" />
                            {t('common.manage') || '管理'}
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {(!customLayouts || customLayouts.length === 0) ? (
                            <div className="py-8 text-center text-sm text-gray-500 border border-dashed border-white/10 rounded-lg bg-white/5">
                                <p>尚無自定布局</p>
                            </div>
                        ) : (
                            <ScrollArea className="h-[200px] -mr-3 pr-3">
                                <div className="space-y-2">
                                    {customLayouts.map(layout => (
                                        <button
                                            key={layout.id}
                                            onClick={() => applyCustomLayout(layout.id)}
                                            className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all flex items-center justify-between group"
                                        >
                                            <span className="text-sm text-gray-200 group-hover:text-white truncate">
                                                {layout.name}
                                            </span>
                                            <ArrowUpRight className="size-3.5 text-gray-500 group-hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-all" />
                                        </button>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}

                        <Button
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={() => setSaveDialogOpen(true)}
                        >
                            <Plus className="size-4 mr-2" />
                            {t('common.save_layout') || '儲存目前布局'}
                        </Button>
                    </div>
                </div>
            </div>

            <SaveLayoutDialog
                open={saveDialogOpen}
                onOpenChange={setSaveDialogOpen}
            />
        </>
    );
};
