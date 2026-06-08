import { useState } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { LayoutGrid, ArrowUpRight, Settings, Plus, Square, Columns2, PanelLeft, PanelRight, PanelBottom, Columns3, Monitor, Swords, Grid3x3, Grid, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SaveLayoutDialog } from '../../components/Layout/SaveLayoutDialog';
import { cn } from '../ui/utils';
import { layoutTemplates } from '../../utils/layoutPresets';

// Layout 面板主題色(對齊設計 FN.layout = violet)
const LAYOUT_ACCENT = '#c084fc';

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
                    "absolute bottom-full left-1/2 -translate-x-1/2 mb-3.5 w-[340px] overflow-hidden transition-all duration-300 ease-out origin-bottom text-white",
                    isExpanded
                        ? "opacity-100 scale-100 translate-y-0"
                        : "opacity-0 scale-95 translate-y-3.5 pointer-events-none"
                )}
                style={{
                    background: 'rgba(12,12,17,0.92)',
                    backdropFilter: 'blur(22px)',
                    WebkitBackdropFilter: 'blur(22px)',
                    borderRadius: 20,
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 60px -18px rgba(0,0,0,0.75)',
                }}
            >
                {/* Panel header(violet icon chip) */}
                <div
                    className="flex items-center justify-between"
                    style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                >
                    <div className="flex items-center gap-2.5">
                        <span
                            className="flex items-center justify-center"
                            style={{
                                width: 30,
                                height: 30,
                                borderRadius: 9,
                                background: `${LAYOUT_ACCENT}1f`,
                                color: LAYOUT_ACCENT,
                                boxShadow: `inset 0 0 0 1px ${LAYOUT_ACCENT}40`,
                            }}
                        >
                            <LayoutGrid className="size-4" />
                        </span>
                        <span className="text-sm font-semibold">{t('common.layout_list') || '布局清單'}</span>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs hover:bg-white/10"
                        style={{ color: LAYOUT_ACCENT }}
                        onClick={onOpenSettings}
                    >
                        <Settings className="size-3.5 mr-1" />
                        {t('common.manage') || '管理'}
                    </Button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Tabs */}
                    <div className="flex p-1 bg-white/5 rounded-lg mb-2">
                        <button
                            onClick={() => setActiveTab('video_only')}
                            className={cn(
                                "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all",
                                activeTab !== 'video_only' && "text-gray-400 hover:text-white/80"
                            )}
                            style={activeTab === 'video_only' ? {
                                background: `${LAYOUT_ACCENT}2a`,
                                color: LAYOUT_ACCENT,
                                boxShadow: `inset 0 0 0 1px ${LAYOUT_ACCENT}40`,
                            } : undefined}
                        >
                            {t('layout.tab_video') || '僅串流'}
                        </button>
                        <button
                            onClick={() => setActiveTab('with_chat')}
                            className={cn(
                                "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all",
                                activeTab !== 'with_chat' && "text-gray-400 hover:text-white/80"
                            )}
                            style={activeTab === 'with_chat' ? {
                                background: `${LAYOUT_ACCENT}2a`,
                                color: LAYOUT_ACCENT,
                                boxShadow: `inset 0 0 0 1px ${LAYOUT_ACCENT}40`,
                            } : undefined}
                        >
                            {t('layout.tab_chat') || '含聊天室'}
                        </button>
                        <button
                            onClick={() => setActiveTab('custom')}
                            className={cn(
                                "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all",
                                activeTab !== 'custom' && "text-gray-400 hover:text-white/80"
                            )}
                            style={activeTab === 'custom' ? {
                                background: `${LAYOUT_ACCENT}2a`,
                                color: LAYOUT_ACCENT,
                                boxShadow: `inset 0 0 0 1px ${LAYOUT_ACCENT}40`,
                            } : undefined}
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
