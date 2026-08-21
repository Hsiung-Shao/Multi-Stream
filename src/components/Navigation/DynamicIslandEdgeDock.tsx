import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Search, Plus, Layout, Tv, Tv2, Star, FolderHeart, Maximize, Minimize, Trash2, Home, Settings,
    LayoutGrid, MessageSquare, ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, AlertTriangle, Share2,
} from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useStreamStore } from '../../store/useStreamStore';
import { useIslandQuickActions } from '../../hooks/useIslandQuickActions';
import { IslandSearch } from './IslandSearch';
import { IslandFavoritesMenu } from './IslandFavoritesMenu';
import { IslandLayoutPicker } from './IslandLayoutPicker';
import { MediaControlPanel } from './MediaControlPanel';
import { ScrollArea } from '../ui/scroll-area';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '../ui/alert-dialog';
import { FN, ISLAND_PANEL_STYLE, islandHeaderChipStyle } from './islandTokens';

// 凸起三段尺寸(對照 mockup 已驗證過的比例)
const SIZE_PX: Record<'sm' | 'md' | 'lg', { w: number; h: number; icon: number }> = {
    sm: { w: 16, h: 32, icon: 12 },
    md: { w: 20, h: 40, icon: 14 },
    lg: { w: 26, h: 50, icon: 17 },
};

type ViewKey = 'list' | 'search' | 'add' | 'layout' | 'media';

// 清單列(圖示 chip + 標籤 + 尾端標記);用 forwardRef + rest 展開讓 Radix asChild(AlertDialogTrigger / PopoverTrigger)
// 能正確轉發 props/ref,對齊 DynamicIsland.tsx 裡 IslandBtn 的既有寫法。
const FunctionRow = forwardRef<
    HTMLButtonElement,
    {
        icon: ComponentType<{ size?: number; fill?: string }>;
        iconFill?: boolean;
        color: string;
        label: string;
        trailing?: React.ReactNode;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ icon: Icon, iconFill, color, label, trailing, ...rest }, ref) => (
    <button
        ref={ref}
        type="button"
        className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-white/90 hover:bg-white/[0.06] transition-colors text-left"
        {...rest}
    >
        <span className="flex items-center justify-center shrink-0" style={islandHeaderChipStyle(color)}>
            <Icon size={16} fill={iconFill ? 'currentColor' : 'none'} />
        </span>
        <span className="flex-1 truncate">{label}</span>
        {trailing}
    </button>
));
FunctionRow.displayName = 'FunctionRow';

function DetailHeader({ title, backLabel, onBack }: { title: string; backLabel: string; onBack: () => void }) {
    return (
        <div className="flex items-center gap-2 px-3 py-3 border-b border-white/[0.08]">
            <button
                type="button"
                onClick={onBack}
                aria-label={backLabel}
                className="w-6 h-6 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/80 hover:text-white transition-colors shrink-0"
            >
                <ArrowLeft size={13} />
            </button>
            <span className="text-sm font-semibold text-white truncate">{title}</span>
        </div>
    );
}

export const DynamicIslandEdgeDock = () => {
    const { t } = useTranslation(['common', 'favorites']);
    const setPage = useUIStore(s => s.setPage);
    const openModal = useUIStore(s => s.openModal);
    const clearCanvasItems = useStreamStore(s => s.clearCanvasItems);
    const addEmptyGroup = useStreamStore(s => s.addEmptyGroup);
    const addCanvasItem = useStreamStore(s => s.addCanvasItem);

    const side = useUIStore(s => s.islandEdgeSide);
    const setSide = useUIStore(s => s.setIslandEdgeSide);
    const size = useUIStore(s => s.islandEdgeSize);
    const y = useUIStore(s => s.islandEdgeY);
    const setY = useUIStore(s => s.setIslandEdgeY);

    const { isFullscreen, toggleFullscreen, handleQuickSave, handleShareCanvas } = useIslandQuickActions();

    const [open, setOpen] = useState(false);
    const [view, setView] = useState<ViewKey>('list');
    const [, setFavMenuOpen] = useState(false);
    const [, setSaveDialogOpen] = useState(false);
    const [clearDialogOpen, setClearDialogOpen] = useState(false);

    const dragState = useRef({ dragging: false, moved: false, startX: 0, startY: 0, startYPercent: 0 });
    const dims = SIZE_PX[size];

    // 面板實際像素位置(以凸起垂直中心為錨點,但夾限在視窗內,避免凸起貼近上下邊緣時面板被裁到畫面外)
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelTop, setPanelTop] = useState<number | null>(null);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragState.current = { dragging: true, moved: false, startX: e.clientX, startY: e.clientY, startYPercent: y };
    };
    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState.current.dragging) return;
        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragState.current.moved = true;
        if (!dragState.current.moved) return;
        const vh = window.innerHeight;
        const deltaPercent = (dy / vh) * 100;
        setY(Math.max(4, Math.min(96, dragState.current.startYPercent + deltaPercent)));
    };
    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState.current.dragging) return;
        dragState.current.dragging = false;
        try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
        if (dragState.current.moved) {
            const newSide = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
            if (newSide !== side) setSide(newSide);
        } else {
            setOpen(o => {
                const next = !o;
                if (next) setView('list');
                return next;
            });
        }
    };

    const backLabel = t('common.back') || '返回';

    const panelWidth = view === 'media' ? 480 : view === 'layout' ? 340 : 300;

    // 面板開啟或內容(清單/子畫面)改變高度時,重新量測並夾限垂直位置,避免貼近視窗上下緣時被裁到看不到。
    // 額外用 ResizeObserver 監看面板實際尺寸(不只是 open/view/y/panelWidth 這幾個 state)——
    // 像搜尋結果展開/收合這種「面板高度變了但上述 state 都沒變」的情況,單靠 deps 不會觸發重算。
    useLayoutEffect(() => {
        if (!open) { setPanelTop(null); return; }
        const el = panelRef.current;
        if (!el) return;
        const recalc = () => {
            const vh = window.innerHeight;
            const margin = 16;
            const centerPx = (y / 100) * vh;
            const top = Math.max(margin, Math.min(centerPx - el.offsetHeight / 2, vh - el.offsetHeight - margin));
            setPanelTop(top);
        };
        recalc();
        window.addEventListener('resize', recalc);
        const ro = new ResizeObserver(recalc);
        ro.observe(el);
        return () => {
            window.removeEventListener('resize', recalc);
            ro.disconnect();
        };
    }, [open, view, y, panelWidth]);

    return (
        <>
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="fixed z-50 flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none pointer-events-auto text-white/75"
                style={{
                    top: `${y}%`,
                    [side]: 0,
                    width: dims.w,
                    height: dims.h,
                    transform: 'translateY(-50%)',
                    background: 'rgba(16,16,22,0.92)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderLeft: side === 'right' ? '1px solid rgba(255,255,255,0.14)' : 'none',
                    borderRight: side === 'left' ? '1px solid rgba(255,255,255,0.14)' : 'none',
                    borderRadius: side === 'left' ? '0 10px 10px 0' : '10px 0 0 10px',
                    boxShadow: '0 10px 22px -8px rgba(0,0,0,0.7)',
                }}
            >
                {side === 'left' ? <ChevronRight size={dims.icon} /> : <ChevronLeft size={dims.icon} />}
            </div>

            {open && (
                <div
                    ref={panelRef}
                    className="fixed z-50 pointer-events-auto overflow-hidden"
                    style={{
                        top: panelTop ?? `${y}%`,
                        [side]: dims.w + 8,
                        transform: panelTop === null ? 'translateY(-50%)' : undefined,
                        visibility: panelTop === null ? 'hidden' : 'visible',
                        width: panelWidth,
                        maxHeight: 'calc(100vh - 32px)',
                        ...ISLAND_PANEL_STYLE,
                    }}
                >
                    {view === 'list' && (
                        <ScrollArea className="max-h-[calc(100vh-32px)] [&>[data-radix-scroll-area-viewport]]:max-h-[calc(100vh-32px)]">
                            <div className="p-1.5 space-y-0.5">
                                <FunctionRow
                                    icon={Search}
                                    color={FN.search.c}
                                    label={t('favorites:island_search_channel') || '搜尋頻道'}
                                    trailing={<ChevronRight size={14} className="opacity-40" />}
                                    onClick={() => setView('search')}
                                />
                                <FunctionRow
                                    icon={Plus}
                                    color={FN.add.c}
                                    label={t('common.add_window') || '新增視窗'}
                                    trailing={<ChevronRight size={14} className="opacity-40" />}
                                    onClick={() => setView('add')}
                                />
                                <FunctionRow
                                    icon={Layout}
                                    color={FN.layout.c}
                                    label={t('common.layout') || '布局設定'}
                                    trailing={<ChevronRight size={14} className="opacity-40" />}
                                    onClick={() => setView('layout')}
                                />
                                <FunctionRow
                                    icon={Tv}
                                    color={FN.media.c}
                                    label={t('common.media') || '媒體控制'}
                                    trailing={<ChevronRight size={14} className="opacity-40" />}
                                    onClick={() => setView('media')}
                                />
                                <IslandFavoritesMenu onOpenChange={setFavMenuOpen}>
                                    <FunctionRow
                                        icon={Star}
                                        iconFill
                                        color={FN.fav.c}
                                        label={t('common.favorites') || '收藏清單'}
                                        trailing={<ChevronRight size={14} className="opacity-40" />}
                                    />
                                </IslandFavoritesMenu>
                                <FunctionRow
                                    icon={FolderHeart}
                                    color={FN.save.c}
                                    label={t('favorites:save_entire_canvas') || '一鍵收藏當前畫布'}
                                    onClick={handleQuickSave}
                                />
                                <FunctionRow
                                    icon={Share2}
                                    color={FN.share.c}
                                    label={t('common.share_canvas') || '分享畫布'}
                                    onClick={handleShareCanvas}
                                />

                                <div className="my-1 border-t border-white/[0.08]" />

                                <FunctionRow
                                    icon={isFullscreen ? Minimize : Maximize}
                                    color={FN.screen.c}
                                    label={isFullscreen ? (t('common.exit_fullscreen') || '退出全螢幕') : (t('common.fullscreen') || '全螢幕')}
                                    onClick={toggleFullscreen}
                                />
                                <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
                                    <AlertDialogTrigger asChild>
                                        <FunctionRow
                                            icon={Trash2}
                                            color={FN.clear.c}
                                            label={t('common.clear_screen') || '清空畫面'}
                                            trailing={<span className="text-xs font-bold" style={{ color: FN.clear.c }}>!</span>}
                                        />
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="z-[60]">
                                        <AlertDialogHeader>
                                            <div className="flex items-center gap-3">
                                                <span
                                                    className="flex items-center justify-center shrink-0"
                                                    style={{
                                                        width: 40,
                                                        height: 40,
                                                        borderRadius: 11,
                                                        background: 'rgba(248,113,113,0.14)',
                                                        color: '#f87171',
                                                        boxShadow: 'inset 0 0 0 1px rgba(248,113,113,0.35)',
                                                    }}
                                                >
                                                    <AlertTriangle size={20} />
                                                </span>
                                                <AlertDialogTitle>{t('common.confirm_clear_title') || '確定要清空所有視窗嗎？'}</AlertDialogTitle>
                                            </div>
                                            <AlertDialogDescription>
                                                {t('common.confirm_clear_desc') || '此動作將會移除畫布上所有的直播視窗與聊天室。'}
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>{t('common.cancel') || '取消'}</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() => clearCanvasItems()}
                                                className="bg-red-500 hover:bg-red-600"
                                            >
                                                {t('common.confirm') || '確定清空'}
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>

                                <div className="my-1 border-t border-white/[0.08]" />

                                <FunctionRow
                                    icon={Home}
                                    color={FN.home.c}
                                    label={t('common.home') || '返回首頁'}
                                    onClick={() => { setOpen(false); setPage('home'); }}
                                />
                                <FunctionRow
                                    icon={Settings}
                                    color={FN.settings.c}
                                    label={t('common.settings') || '設定'}
                                    trailing={<ExternalLink size={13} className="opacity-40" />}
                                    onClick={() => { setOpen(false); openModal('favorites', 'global_settings'); }}
                                />
                            </div>
                        </ScrollArea>
                    )}

                    {view === 'search' && (
                        <>
                            <DetailHeader title={t('favorites:island_search_channel') || '搜尋頻道'} backLabel={backLabel} onBack={() => setView('list')} />
                            <div className="p-3">
                                <IslandSearch onSearch={() => setOpen(false)} resultsPlacement="inline" />
                            </div>
                        </>
                    )}

                    {view === 'add' && (
                        <>
                            <DetailHeader title={t('common.add_window') || '新增視窗'} backLabel={backLabel} onBack={() => setView('list')} />
                            <div className="p-1.5 space-y-0.5">
                                <FunctionRow
                                    icon={Tv2}
                                    color={FN.add.c}
                                    label={t('common.add_stream_window') || '新增串流視窗'}
                                    onClick={() => { addCanvasItem('stream', null); setOpen(false); }}
                                />
                                <FunctionRow
                                    icon={LayoutGrid}
                                    color={FN.add.c}
                                    label={t('common.add_combination') || '新增組合'}
                                    onClick={() => { addEmptyGroup(); setOpen(false); }}
                                />
                                <FunctionRow
                                    icon={MessageSquare}
                                    color={FN.add.c}
                                    label={t('common.add_chat_window') || '新增聊天室窗'}
                                    onClick={() => { addCanvasItem('chat', null); setOpen(false); }}
                                />
                            </div>
                        </>
                    )}

                    {view === 'layout' && (
                        <>
                            <DetailHeader title={t('common.layout') || '布局設定'} backLabel={backLabel} onBack={() => setView('list')} />
                            <IslandLayoutPicker
                                variant="inline"
                                isExpanded
                                onOpenSettings={() => { setOpen(false); openModal('favorites', 'layouts'); }}
                                onSaveDialogOpenChange={setSaveDialogOpen}
                            />
                        </>
                    )}

                    {view === 'media' && (
                        <>
                            <DetailHeader title={t('common.media') || '媒體控制'} backLabel={backLabel} onBack={() => setView('list')} />
                            <MediaControlPanel variant="inline" isExpanded />
                        </>
                    )}
                </div>
            )}
        </>
    );
};
