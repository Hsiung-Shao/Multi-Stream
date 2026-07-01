import { useEffect, useState, forwardRef } from 'react';
import type { ComponentType } from 'react';
import { Home, Plus, Layout, Settings, Star, Tv, Trash2, FolderHeart, Maximize, Minimize, AlertTriangle } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useStreamStore } from '../../store/useStreamStore';
import { MediaControlPanel } from './MediaControlPanel';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { useDynamicIsland } from '../../hooks/useDynamicIsland';
import { IslandSearch } from './IslandSearch';
import { IslandFavoritesMenu } from './IslandFavoritesMenu';
import { IslandLayoutPicker } from './IslandLayoutPicker';
import { cn } from '../ui/utils';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { favoritesService } from '../../features/favorites/FavoritesService';



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
} from '../../components/ui/alert-dialog';

import {
    requestFullscreen,
    exitFullscreen,
    getFullscreenElement,
    onFullscreenChange
} from '../../utils/fullscreenUtils';

// ---- Function color tokens(見 islandTokens.ts,與各面板共用) ----
import { FN, type FnKey } from './islandTokens';

// 島上分隔線(對齊設計:w1 h22 white/14 mx5)
const IslandDivider = () => (
    <div className="shrink-0" style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.14)', margin: '0 5px' }} />
);

interface IslandBtnProps {
    fn: FnKey;
    icon: ComponentType<{ size?: number; strokeWidth?: number; fill?: string }>;
    title: string;
    active?: boolean;
    fill?: boolean;
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

// 共用島按鈕:語意色 + hover/active glow + active 指示條(對齊設計 IslandBtn L129-152)
// 用 forwardRef + spread 讓 Radix asChild 的 trigger(dropdown/popover/alert-dialog)能正常轉發 props/ref。
const IslandBtn = forwardRef<HTMLButtonElement, IslandBtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ fn, icon: Icon, title, active = false, fill = false, onClick, ...rest }, ref) => {
        const [hover, setHover] = useState(false);
        const col = FN[fn];
        const on = active || hover;
        return (
            <button
                ref={ref}
                type="button"
                title={title}
                aria-label={title}
                aria-pressed={active}
                onClick={onClick}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                className="relative inline-flex items-center justify-center shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    border: 0,
                    background: active ? `${col.c}29` : hover ? `${col.c}1a` : 'transparent',
                    color: col.c,
                    cursor: 'pointer',
                    transition: 'all 0.18s',
                    boxShadow: on ? `inset 0 0 0 1px ${col.c}55, 0 8px 18px -8px ${col.glow}` : 'none',
                }}
                {...rest}
            >
                <span
                    className="flex"
                    style={{
                        opacity: on ? 1 : 0.9,
                        filter: on ? `drop-shadow(0 0 5px ${col.glow})` : 'none',
                        transition: 'all 0.18s',
                    }}
                >
                    <Icon size={19} strokeWidth={2} fill={fill ? 'currentColor' : 'none'} />
                </span>
                {active && (
                    <span
                        style={{
                            position: 'absolute',
                            bottom: 3,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 13,
                            height: 2.5,
                            borderRadius: 2,
                            background: col.c,
                            boxShadow: `0 0 6px ${col.c}`,
                        }}
                    />
                )}
            </button>
        );
    }
);
IslandBtn.displayName = 'IslandBtn';

export const DynamicIsland = () => {
    const { t } = useTranslation(['common', 'favorites']);
    const setPage = useUIStore(s => s.setPage);
    const openModal = useUIStore(s => s.openModal);
    const clearCanvasItems = useStreamStore(s => s.clearCanvasItems);
    const streams = useStreamStore(s => s.streams);
    const addEmptyGroup = useStreamStore(s => s.addEmptyGroup);
    const addCanvasItem = useStreamStore(s => s.addCanvasItem);

    // const [settingsDialogOpen, setSettingsDialogOpen] = useState(false); // Removed
    const [mediaControlExpanded, setMediaControlExpanded] = useState(false);
    const [layoutPickerExpanded, setLayoutPickerExpanded] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    // portal 彈出 UI 的 open 狀態 + 搜尋聚焦:任一為真即「使用中」,釘住動態島不隱藏
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [clearDialogOpen, setClearDialogOpen] = useState(false);
    const [favMenuOpen, setFavMenuOpen] = useState(false);
    const [searchActive, setSearchActive] = useState(false);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);

    // Fullscreen listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!getFullscreenElement());
        };

        return onFullscreenChange(handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!getFullscreenElement()) {
            requestFullscreen(document.documentElement).catch(() => {
                toast.error('無法進入全螢幕');
            });
        } else {
            exitFullscreen().catch(() => {
                console.error('Error exiting fullscreen');
            });
        }
    };

    // Dynamic Island Hook — shows when mouse near bottom edge
    const { isCollapsed, setPinned, handlers } = useDynamicIsland();

    // 彙整「使用中」訊號 → 釘住/解除釘住(單一真實來源)
    const pinned = mediaControlExpanded || layoutPickerExpanded || addMenuOpen || favMenuOpen || clearDialogOpen || searchActive || saveDialogOpen;
    useEffect(() => {
        setPinned(pinned);
    }, [pinned, setPinned]);

    const handleQuickSave = async () => {
        if (streams.length === 0) {
            toast.error(t('favorites:no_streams_to_save') || '沒有可收藏的串流');
            return;
        }

        let successCount = 0;

        try {
            const targetCategoryId: string | null = null;

            for (const stream of streams) {
                let url = '';
                if (stream.platform === 'twitch') {
                    url = `https://twitch.tv/${stream.channelId}`;
                } else if (stream.platform === 'youtube') {
                    url = stream.videoId
                        ? `https://youtube.com/watch?v=${stream.videoId}`
                        : `https://youtube.com/channel/${stream.channelId}`;
                }

                if (url) {
                    await favoritesService.addFavorite(
                        url,
                        stream.displayName || stream.channelId || stream.videoId || 'Stream',
                        targetCategoryId
                    );
                    successCount++;
                }
            }

            toast.success(t('favorites:batch_save_success_simple', { count: successCount }) || `已收藏 ${successCount} 個串流`);

        } catch {
            console.error('Quick save failed');
            toast.error(t('common.error') || '發生錯誤');
        }
    };

    return (
        <>
            <div
                className="fixed z-50 bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto"
                {...handlers} // Attach mouse handlers for auto-hide
            >
                {/* 媒體控制面板 */}
                <MediaControlPanel
                    isExpanded={mediaControlExpanded}
                    onMouseLeave={() => setMediaControlExpanded(false)}
                />

                <div
                    className={cn(
                        "relative flex items-center transition-all duration-500 ease-in-out",
                        isCollapsed ? "translate-y-[200%] opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
                    )}
                    style={{
                        background: 'linear-gradient(180deg, rgba(28,28,36,0.86), rgba(10,10,14,0.92))',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderRadius: 9999,
                        padding: '7px 10px',
                        gap: 3,
                        border: '1px solid rgba(255,255,255,0.12)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 50px -16px rgba(0,0,0,0.7)',
                    }}
                >
                    <div className="flex items-center" style={{ gap: 3 }}>

                        {/* Group 1: Search Module */}
                        <IslandSearch onActiveChange={setSearchActive} />

                        <IslandDivider />

                        {/* Group 2: Controls */}

                        {/* 1. Add Window */}
                        <DropdownMenu open={addMenuOpen} onOpenChange={setAddMenuOpen}>
                            <DropdownMenuTrigger asChild>
                                <IslandBtn fn="add" icon={Plus} title={t('common.add_window') || '新增視窗'} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="top" align="center" className="bg-black/90 border-white/10 backdrop-blur-md text-white z-[60]">
                                <DropdownMenuItem className="focus:bg-white/20 focus:text-white cursor-pointer" onClick={() => addEmptyGroup()}>
                                    {t('common.add_combination') || "新增組合"}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="focus:bg-white/20 focus:text-white cursor-pointer" onClick={() => addCanvasItem('stream', null)}>
                                    {t('common.add_stream_window') || "新增串流視窗"}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="focus:bg-white/20 focus:text-white cursor-pointer" onClick={() => addCanvasItem('chat', null)}>
                                    {t('common.add_chat_window') || "新增聊天室窗"}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* 2. Layout Settings */}
                        <IslandLayoutPicker
                            isExpanded={layoutPickerExpanded}
                            onMouseLeave={() => setLayoutPickerExpanded(false)}
                            onOpenSettings={() => openModal('favorites', 'layouts')}
                            onSaveDialogOpenChange={setSaveDialogOpen}
                        />
                        <IslandBtn
                            fn="layout"
                            icon={Layout}
                            title={t('common.layout') || '布局設定'}
                            active={layoutPickerExpanded}
                            onClick={() => setLayoutPickerExpanded(!layoutPickerExpanded)}
                        />

                        {/* 3. Media Controls */}
                        <IslandBtn
                            fn="media"
                            icon={Tv}
                            title={t('common.media') || '媒體控制'}
                            active={mediaControlExpanded}
                            onClick={() => setMediaControlExpanded(!mediaControlExpanded)}
                        />

                        {/* 4. Favorites List */}
                        <IslandFavoritesMenu onOpenChange={setFavMenuOpen}>
                            <IslandBtn fn="fav" icon={Star} fill title={t('common.favorites') || '收藏清單'} />
                        </IslandFavoritesMenu>

                        {/* 5. One-click Favorite (Quick Save) */}
                        <IslandBtn
                            fn="save"
                            icon={FolderHeart}
                            title={t('favorites:save_entire_canvas') || '一鍵收藏當前畫布'}
                            onClick={handleQuickSave}
                        />

                        <IslandDivider />

                        {/* 6. Fullscreen */}
                        <IslandBtn
                            fn="screen"
                            icon={isFullscreen ? Minimize : Maximize}
                            title={isFullscreen ? (t('common.exit_fullscreen') || '退出全螢幕') : (t('common.fullscreen') || '全螢幕')}
                            onClick={toggleFullscreen}
                        />

                        {/* 7. Clear Canvas */}
                        <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
                            <AlertDialogTrigger asChild>
                                <IslandBtn fn="clear" icon={Trash2} title={t('common.clear_screen') || '清空畫面'} />
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

                        <IslandDivider />

                        {/* Group 3: Navigation */}

                        {/* Home */}
                        <IslandBtn
                            fn="home"
                            icon={Home}
                            title={t('common.home') || '返回首頁'}
                            onClick={() => setPage('home')}
                        />

                        {/* Settings request: Opens Favorites Manager now */}
                        <IslandBtn
                            fn="settings"
                            icon={Settings}
                            title={t('common.settings') || '設定'}
                            onClick={() => openModal('favorites', 'global_settings')}
                        />
                    </div>
                </div>
            </div>

            {/* <SettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} /> */}
        </>
    );
};
