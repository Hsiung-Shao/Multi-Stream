import { useTranslation } from 'react-i18next';
import { useStreamStore } from '../../store/useStreamStore';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { Monitor, MessageSquare, GripHorizontal, X } from 'lucide-react';
import { WindowRenderProps } from '../Canvas';
import { cn } from '../ui/utils';
import { Button } from '../ui/button';
import { useFavorites } from '../../hooks/useFavorites';
import { toast } from 'sonner';

interface EmptyWindowContentProps {
    windowId: string;
    type: 'stream' | 'chat';
    onUpdateWindow: (id: string, updates: any) => void;
    renderProps: WindowRenderProps;
}

export const EmptyWindowContent = ({ windowId, type, onUpdateWindow, renderProps }: EmptyWindowContentProps) => {
    const { t } = useTranslation(['common', 'favorites']);
    const streams = useStreamStore(s => s.streams);
    const { dragHandlers, isDragging, onRemove } = renderProps;

    // Use the new hook for reactive updates
    const { favorites: allFavorites, liveFavorites: liveParams } = useFavorites();

    const liveFavorites = liveParams;

    const handleTypeChange = (newType: string) => {
        onUpdateWindow(windowId, { type: newType as 'stream' | 'chat' });
    };

    const handleStreamSelect = async (streamId: string) => {
        let toastId: string | number | undefined;
        try {
            // Find stream in EXISTING streams
            const existingStream = streams.find(s => s.id.toString() === streamId);

            if (existingStream) {
                onUpdateWindow(windowId, { contentId: existingStream.id });
            } else {
                // If it's a favorite not yet in "streams" store, we need to `addStream` first.
                const fav = allFavorites.find(f => f.id === streamId);
                if (fav) {
                    toastId = toast.loading(t('common.loading') || '載入中...');

                    // Safety Timeout: If addStream hangs for more than 15 seconds, force error.
                    // This prevents the toast from spinning forever if backend/network fails silently.
                    const safetyTimeoutId = setTimeout(() => {
                        if (toastId) {
                            console.warn('[EmptyWindowContent] addStream operation timed out (safety check).');
                            toast.error(t('common.timeout') || '請求逾時，請稍後再試', { id: toastId });
                        }
                    }, 15000);

                    try {
                        // Add to store first - use liveUrl if available (resolved videoId), fallback to base url
                        const addStream = useStreamStore.getState().addStream;
                        const urlToAdd = (fav as any).liveUrl || fav.url;
                        const result = await addStream(urlToAdd, {
                            withChat: false,
                            withStream: false,
                            displayName: fav.name // Use favorite name
                        });

                        clearTimeout(safetyTimeoutId);

                        if (result.streamId) {
                            console.log('[EmptyWindowContent] addStream success, updating window:', { windowId, streamId: result.streamId });
                            onUpdateWindow(windowId, { contentId: result.streamId });
                            toast.dismiss(toastId);
                        } else {
                            console.warn('[EmptyWindowContent] addStream failed or no streamId:', result);
                            toast.error(result.message || t('common.error') || '發生錯誤', { id: toastId });
                        }
                    } catch (err) {
                        clearTimeout(safetyTimeoutId);
                        throw err;
                    }
                }
            }
        } catch (error) {
            console.error('Selection failed', error);
            if (toastId) toast.error(t('common.error') || '發生未知錯誤', { id: toastId });
            else toast.error(t('common.error') || '發生未知錯誤');
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-4 gap-6 relative group border border-white/10 rounded-lg">

            {/* Drag Handle - Top Center */}
            <div
                className={cn(
                    "absolute top-2 left-1/2 -translate-x-1/2 z-[60]",
                    "flex items-center gap-1 p-1 pl-3 pr-1",
                    "bg-black/80 backdrop-blur-md rounded-full",
                    "border border-white/10 shadow-lg",
                    "transition-opacity select-none",
                    "opacity-0 group-hover:opacity-100",
                    isDragging && "opacity-100 bg-purple-900/80 cursor-grabbing"
                )}
                {...dragHandlers}
            >
                <div className="cursor-grab flex items-center text-white/70 hover:text-white mr-1 gap-2">
                    <GripHorizontal size={14} />
                    <span className="text-[10px] font-medium max-w-[100px] truncate">
                        {t('common.empty_window', '空視窗')}
                    </span>
                </div>

                <div className="h-3 w-[1px] bg-white/20 mx-1" />

                {/* Remove Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-red-500/20 text-white/70 hover:text-red-400 nodrag"
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    title={t('common.remove', '移除')}
                >
                    <X size={12} />
                </Button>
            </div>

            <div className="flex flex-col items-center gap-2">
                <h3 className="text-lg font-medium text-white/70">
                    {t('common.empty_window', '空視窗')}
                </h3>
                <p className="text-sm text-white/50">
                    {t('common.select_content', '請選擇顯示內容')}
                </p>
            </div>

            {/* Type Toggle */}
            <Tabs
                value={type}
                onValueChange={handleTypeChange}
                className="w-full max-w-[200px]"
            >
                <TabsList className="grid w-full grid-cols-2 bg-black/40">
                    <TabsTrigger value="stream" className="gap-2">
                        <Monitor size={14} />
                        {t('common.stream', '串流')}
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="gap-2">
                        <MessageSquare size={14} />
                        {t('common.chat', '聊天室')}
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {/* Live Favorites Dropdown */}
            <div className="w-full max-w-[280px] space-y-2">
                <label className="text-xs font-medium text-white/50 ml-1">
                    {t('favorites.live_now', '正在直播的收藏')}
                </label>
                <Select onValueChange={handleStreamSelect}>
                    <SelectTrigger className="w-full bg-black/40 border-white/10 text-white mb-2">
                        <SelectValue placeholder={t('favorites.select_live_stream', '選擇直播频道...')} />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                        {liveFavorites.length > 0 ? (
                            liveFavorites.map(fav => (
                                <SelectItem key={fav.id} value={fav.id} className="focus:bg-white/10 focus:text-white cursor-pointer">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                        <span className="truncate">{fav.name}</span>
                                    </div>
                                </SelectItem>
                            ))
                        ) : (
                            <div className="p-2 text-sm text-white/50 text-center">
                                {t('favorites.no_live_streams', '目前沒有直播中的收藏')}
                            </div>
                        )}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
};
