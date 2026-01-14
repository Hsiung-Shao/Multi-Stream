import { useState } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { LayoutGrid, ArrowUpRight, Settings, Plus, Square, Columns2, PanelLeft, PanelRight, PanelBottom, Columns3, Monitor, Swords, Grid3x3, Grid, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SaveLayoutDialog } from '../../components/Layout/SaveLayoutDialog';
import { cn } from '../ui/utils';
import { layoutTemplates } from '../../utils/layoutPresets';

const iconMap: Record<string, any> = {
    'Square': Square,
    'Columns2': Columns2,
    'Columns3': Columns3,
    'PanelLeft': PanelLeft,
    'PanelRight': PanelRight,
    'PanelBottom': PanelBottom,
    'Monitor': Monitor,
    'Swords': Swords,
    'LayoutGrid': LayoutGrid,
    'Grid3x3': Grid3x3,
    'Grid': Grid,
    'Smartphone': Smartphone
};

interface IslandLayoutPickerProps {
    isExpanded: boolean;
    onMouseLeave?: () => void;
    onOpenSettings: () => void;
}

export const IslandLayoutPicker = ({ isExpanded, onMouseLeave, onOpenSettings }: IslandLayoutPickerProps) => {
    const { t } = useTranslation(['common', 'favorites'] as const);
    const customLayouts = useStreamStore(state => state.customLayouts);
    const applyCustomLayout = useStreamStore(state => state.applyCustomLayout);
    const applyTemplateLayout = useStreamStore(state => state.applyTemplateLayout);

    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'video_only' | 'with_chat' | 'custom'>('video_only');

    // Separate templates
    const videoTemplates = layoutTemplates.filter(t => t.type === 'video_only');
    const chatTemplates = layoutTemplates.filter(t => t.type === 'with_chat');


    return (
        <>
            <div
                onMouseLeave={onMouseLeave}
                className={cn(
                    "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[340px] bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-500 ease-out origin-bottom",
                    isExpanded
                        ? "opacity-100 scale-100 translate-y-0"
                        : "opacity-0 scale-95 translate-y-4 pointer-events-none"
                )}
            >
                <div className="p-4 space-y-4">
                    {/* Header */}
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

                    {/* Tabs */}
                    <div className="flex p-1 bg-white/5 rounded-lg mb-2">
                        <button
                            onClick={() => setActiveTab('video_only')}
                            className={cn(
                                "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all",
                                activeTab === 'video_only'
                                    ? "bg-white/10 text-white shadow-sm"
                                    : "text-gray-400 hover:text-white/80"
                            )}
                        >
                            {t('layout.tab_video') || '僅串流'}
                        </button>
                        <button
                            onClick={() => setActiveTab('with_chat')}
                            className={cn(
                                "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all",
                                activeTab === 'with_chat'
                                    ? "bg-white/10 text-white shadow-sm"
                                    : "text-gray-400 hover:text-white/80"
                            )}
                        >
                            {t('layout.tab_chat') || '含聊天室'}
                        </button>
                        <button
                            onClick={() => setActiveTab('custom')}
                            className={cn(
                                "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all",
                                activeTab === 'custom'
                                    ? "bg-white/10 text-white shadow-sm"
                                    : "text-gray-400 hover:text-white/80"
                            )}
                        >
                            {t('layout.tab_custom') || '自訂義'}
                        </button>
                    </div>

                    {/* Content */}
                    <div className="min-h-[250px]">
                        {activeTab === 'video_only' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <ScrollArea className="h-[250px] -mr-2 pr-2">
                                    <div className="grid grid-cols-4 gap-2 pb-2">
                                        {videoTemplates.map(template => {
                                            const Icon = iconMap[template.icon] || LayoutGrid;
                                            return (
                                                <button
                                                    key={template.id}
                                                    onClick={() => applyTemplateLayout(template.id)}
                                                    className="aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-purple-600/20 hover:border-purple-500/50 border border-white/5 transition-all group relative overflow-hidden"
                                                    title={t(template.nameKey as any) || template.nameKey}
                                                >
                                                    <Icon className="size-5 text-gray-300 group-hover:text-purple-300 transition-colors" />
                                                    <span className="text-[10px] text-gray-400 group-hover:text-purple-200 font-medium">{template.count}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}

                        {activeTab === 'with_chat' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <ScrollArea className="h-[250px] -mr-2 pr-2">
                                    <div className="grid grid-cols-4 gap-2 pb-2">
                                        {chatTemplates.map(template => {
                                            const Icon = iconMap[template.icon] || LayoutGrid;
                                            return (
                                                <button
                                                    key={template.id}
                                                    onClick={() => applyTemplateLayout(template.id)}
                                                    className="aspect-square flex flex-col items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-purple-600/20 hover:border-purple-500/50 border border-white/5 transition-all group relative overflow-hidden"
                                                    title={t(template.nameKey as any) || template.nameKey}
                                                >
                                                    <Icon className="size-5 text-gray-300 group-hover:text-purple-300 transition-colors" />
                                                    <span className="text-[10px] text-gray-400 group-hover:text-purple-200 font-medium">{template.count}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}

                        {activeTab === 'custom' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                                {/* User Layouts Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">
                                            {t('layout.my_layouts') || '我的收藏'}
                                        </h4>
                                        <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                                            {customLayouts.length}
                                        </span>
                                    </div>

                                    {(!customLayouts || customLayouts.length === 0) ? (
                                        <div className="py-8 text-center text-xs text-gray-500 border border-dashed border-white/10 rounded-lg bg-white/5 flex flex-col items-center justify-center gap-2">
                                            <LayoutGrid className="size-6 opacity-20" />
                                            <p>尚無自定布局</p>
                                        </div>
                                    ) : (
                                        <ScrollArea className="h-[180px] -mr-3 pr-3">
                                            <div className="space-y-2">
                                                {customLayouts.map(layout => (
                                                    <button
                                                        key={layout.id}
                                                        onClick={() => applyCustomLayout(layout.id)}
                                                        className="w-full text-left px-3 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-purple-500/30 transition-all flex items-center justify-between group"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="size-8 rounded bg-black/40 flex items-center justify-center border border-white/5">
                                                                <LayoutGrid className="size-4 text-gray-400 group-hover:text-purple-400 transition-colors" />
                                                            </div>
                                                            <span className="text-sm text-gray-300 group-hover:text-white truncate font-medium">
                                                                {layout.name}
                                                            </span>
                                                        </div>
                                                        <ArrowUpRight className="size-3.5 text-gray-600 group-hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                                    </button>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    )}

                                    <Button
                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-900/20"
                                        onClick={() => setSaveDialogOpen(true)}
                                    >
                                        <Plus className="size-4 mr-2" />
                                        {t('common.save_layout') || '儲存目前布局'}
                                    </Button>
                                </div>
                            </div>
                        )}
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
