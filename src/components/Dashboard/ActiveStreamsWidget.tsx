
import { useTranslation } from 'react-i18next';
import { Play, Radio, RefreshCw } from 'lucide-react';
import { useFavorites } from '../../hooks/useFavorites';
import { useStreamStore } from '../../store/useStreamStore';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { toast } from 'sonner';
import { useLiveStatusCheck } from '../../features/favorites/useLiveStatusCheck';
import { cn } from '../ui/utils';
import { useState } from 'react';

export const ActiveStreamsWidget = () => {
    const { t } = useTranslation(['common', 'favorites', 'welcome']);
    const { favorites } = useFavorites();
    const { addStream } = useStreamStore();
    const { checkNow, isRefreshing } = useLiveStatusCheck();
    const [isChecking, setIsChecking] = useState(false);

    // Filter live favorites
    const liveStreams = favorites.filter(f => f.isLive);

    const handlePlay = async (url: string) => {
        const result = await addStream(url);
        if (result.success) {
            toast.success(t('favorites:successAdded') || 'Stream added');
        } else {
            toast.error(result.message);
        }
    };

    const handleRefresh = async () => {
        setIsChecking(true);
        await checkNow();
        setTimeout(() => setIsChecking(false), 1000); // Minimum spin time
    };

    if (liveStreams.length === 0) {
        return (
            <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-xl backdrop-blur-sm h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Radio className="h-5 w-5 text-red-500" />
                        {t('welcome:activeStreams.liveChannels') || '正在直播的頻道'}
                    </h3>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleRefresh}
                        className="h-8 w-8 text-gray-500 hover:text-gray-900 dark:text-white/40 dark:hover:text-white"
                        disabled={isRefreshing || isChecking}
                    >
                        <RefreshCw className={cn("h-4 w-4", (isRefreshing || isChecking) && "animate-spin")} />
                    </Button>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 min-h-[150px] opacity-60">
                    <div className="rounded-full bg-gray-100 dark:bg-white/5 p-3">
                        <Radio className="h-6 w-6 text-gray-400 dark:text-white/20" />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-white/40">
                        {t('welcome:activeStreams.empty') || 'No favorite channels are currently live.'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-xl backdrop-blur-sm transition-all hover:bg-white dark:hover:bg-white/10 h-full flex flex-col">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-red-500/10 blur-3xl" />

            <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Radio className="h-5 w-5 text-red-500 animate-pulse" />
                        {t('welcome:activeStreams.liveChannels') || '正在直播的頻道'}
                    </h3>
                    <span className="bg-red-500/20 text-red-600 dark:text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-500/20">
                        {liveStreams.length}
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRefresh}
                    className="h-8 w-8 text-gray-500 hover:text-gray-900 dark:text-white/40 dark:hover:text-white"
                    disabled={isRefreshing || isChecking}
                >
                    <RefreshCw className={cn("h-4 w-4", (isRefreshing || isChecking) && "animate-spin")} />
                </Button>
            </div>

            <div className="flex-1 min-h-0 relative z-10">
                <ScrollArea className="h-full pr-2">
                    <div className="space-y-3 pb-2">
                        {liveStreams.map(stream => (
                            <div
                                key={stream.id}
                                className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-black/20 p-3 hover:bg-gray-100 dark:hover:bg-black/40 transition-colors group"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    {/* Avatar placeholder or platform icon */}
                                    <div className={cn(
                                        "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                                        stream.platform === 'twitch' ? 'bg-[#9146FF]/20 text-[#9146FF]' : 'bg-[#FF0000]/20 text-[#FF0000]'
                                    )}>
                                        {stream.platform === 'twitch' ? (
                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" /></svg>
                                        ) : (
                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                                        )}
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm font-medium text-gray-900 dark:text-white/90 truncate">
                                            {stream.name || stream.channelId}
                                        </span>
                                        {stream.gameName && (
                                            <span className="text-xs text-gray-500 dark:text-white/50 truncate">
                                                {stream.gameName}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {stream.viewerCount !== undefined && stream.viewerCount !== null && stream.viewerCount > 0 && (
                                        <span className="text-xs text-red-400 font-mono hidden sm:inline-block">
                                            {new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(stream.viewerCount)}
                                        </span>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => stream.url && handlePlay(stream.url)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-white hover:bg-gray-100 text-gray-900 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white h-8 px-3"
                                    >
                                        <Play className="h-3 w-3 mr-1" />
                                        {t('common:common.play') || 'Watch'}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
};
