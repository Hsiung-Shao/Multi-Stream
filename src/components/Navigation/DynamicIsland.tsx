import { useEffect, useState } from 'react';
import { Home, Plus, Layout, Settings, Star, Tv, Trash2, FolderHeart, Maximize, Minimize } from 'lucide-react';
import { Button } from '../../components/ui/button';
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

    // Fullscreen listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                toast.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    // Dynamic Island Hook
    const { isCollapsed, handlers } = useDynamicIsland({ idleTime: 5000 });

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
                        stream.displayName || stream.name || stream.channelId || stream.videoId || 'Stream',
                        targetCategoryId
                    );
                    successCount++;
                }
            }

            toast.success(t('favorites:batch_save_success_simple', { count: successCount }) || `已收藏 ${successCount} 個串流`);

        } catch (error) {
            console.error(error);
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

                <div className={cn(
                    "bg-black/80 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2 border border-white/10 shadow-2xl transition-all duration-500 ease-in-out",
                    "hover:scale-105 active:scale-95",
                    isCollapsed ? "translate-y-[200%] opacity-50" : "translate-y-0 opacity-100"
                )}>
                    <div className="flex items-center gap-1">

                        {/* Group 1: Search Module */}
                        <IslandSearch />

                        <div className="w-[1px] h-6 bg-white/20 mx-1" />

                        {/* Group 2: Controls */}

                        {/* 1. Add Window */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full hover:bg-white/10 text-white"
                                    title={t('common.add_window') || "新增視窗"}
                                >
                                    <Plus size={20} />
                                </Button>
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
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={() => setLayoutPickerExpanded(!layoutPickerExpanded)}
                            title={t('common.layout') || "布局設定"}
                        >
                            <Layout size={20} />
                        </Button>

                        {/* 3. Media Controls */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={() => setMediaControlExpanded(!mediaControlExpanded)}
                            title={t('common.media') || "媒體控制"}
                        >
                            <Tv size={20} />
                        </Button>

                        {/* 4. Favorites List */}
                        <IslandFavoritesMenu>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full hover:bg-white/10 text-white"
                                title={t('common.favorites') || "收藏清單"}
                            >
                                <Star size={20} />
                            </Button>
                        </IslandFavoritesMenu>

                        {/* 5. One-click Favorite (Quick Save) */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={handleQuickSave}
                            title={t('favorites:save_entire_canvas') || "一鍵收藏當前畫布"}
                        >
                            <FolderHeart size={20} />
                        </Button>

                        {/* 6. Fullscreen */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={toggleFullscreen}
                            title={isFullscreen ? (t('common.exit_fullscreen') || "退出全螢幕") : (t('common.fullscreen') || "全螢幕")}
                        >
                            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                        </Button>

                        {/* 7. Clear Canvas */}
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full hover:bg-white/10 text-red-400 hover:text-red-300"
                                    title={t('common.clear_screen') || "清空畫面"}
                                >
                                    <Trash2 size={20} />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="z-[60]">
                                <AlertDialogHeader>
                                    <AlertDialogTitle>{t('common.confirm_clear_title') || '確定要清空所有視窗嗎？'}</AlertDialogTitle>
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

                        <div className="w-[1px] h-6 bg-white/20 mx-1" />

                        {/* Group 3: Navigation */}

                        {/* Home */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={() => setPage('home')}
                            title={t('common.home') || "返回首頁"}
                        >
                            <Home size={20} />
                        </Button>

                        {/* Settings request: Opens Favorites Manager now */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full hover:bg-white/10 text-white"
                            onClick={() => openModal('favorites', 'global_settings')}
                            title={t('common.settings') || "設定"}
                        >
                            <Settings size={20} />
                        </Button>
                    </div>
                </div>
            </div>

            {/* <SettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} /> */}
        </>
    );
};
