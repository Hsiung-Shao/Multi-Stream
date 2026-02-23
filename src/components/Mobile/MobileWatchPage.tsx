import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { Volume2, VolumeX, X, Tv, ChevronDown, ChevronUp } from 'lucide-react';
import { Slider } from '../ui/slider';
import { cn } from '../ui/utils';

interface MobileWatchPageProps {
    isLandscape?: boolean;
}

export function MobileWatchPage({ isLandscape = false }: MobileWatchPageProps) {
    const { t } = useTranslation();
    const streams = useStreamStore(s => s.streams);
    const removeStream = useStreamStore(s => s.removeStream);
    const masterVolume = useUIStore(s => s.masterVolume);
    const masterMuted = useUIStore(s => s.masterMuted);
    const setMasterMuted = useUIStore(s => s.setMasterMuted);
    const setMasterVolume = useUIStore(s => s.setMasterVolume);

    const [expandedStream, setExpandedStream] = useState<number | null>(null);

    const activeStreams = streams.filter(s => s.channelId);

    if (activeStreams.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gray-900 border border-white/10 flex items-center justify-center mb-6">
                    <Tv className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                    {t('mobile.watch.empty_title', '尚未新增串流')}
                </h2>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                    {t('mobile.watch.empty_desc', '點擊下方 + 按鈕來新增 Twitch 或 YouTube 串流')}
                </p>
            </div>
        );
    }

    // Landscape: streams side-by-side in a scrollable row
    if (isLandscape) {
        return (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Volume bar — compact in landscape */}
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-900/50 border-b border-white/5 shrink-0">
                    <button
                        onClick={() => setMasterMuted(!masterMuted)}
                        className="text-muted-foreground hover:text-white transition-colors"
                    >
                        {masterMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <Slider
                        value={[masterMuted ? 0 : masterVolume]}
                        onValueChange={(vals) => {
                            if (masterMuted) setMasterMuted(false);
                            setMasterVolume(vals[0]);
                        }}
                        max={100}
                        step={1}
                        className="w-32"
                    />
                    <span className="text-[10px] text-muted-foreground w-6 text-right tabular-nums">
                        {masterMuted ? 0 : masterVolume}
                    </span>
                </div>

                {/* Horizontal stream grid */}
                <div className="flex-1 min-h-0 flex gap-1 p-1 overflow-x-auto">
                    {activeStreams.map((stream) => (
                        <div
                            key={stream.id}
                            className="h-full shrink-0 flex flex-col rounded-lg overflow-hidden border border-white/5 bg-gray-900/40"
                            style={{
                                width: activeStreams.length === 1
                                    ? '100%'
                                    : activeStreams.length === 2
                                        ? 'calc(50% - 2px)'
                                        : 'calc(50% - 2px)',
                                minWidth: '280px',
                            }}
                        >
                            {/* Stream Embed — fills available height */}
                            <div className="flex-1 min-h-0 relative">
                                {stream.platform === 'twitch' ? (
                                    <iframe
                                        src={`https://player.twitch.tv/?channel=${stream.channelId}&parent=${window.location.hostname}&muted=false`}
                                        className="absolute inset-0 w-full h-full border-0"
                                        allowFullScreen
                                        title={`twitch-${stream.channelId}`}
                                    />
                                ) : (
                                    <iframe
                                        src={`https://www.youtube.com/embed/${stream.videoId || stream.channelId}?autoplay=1&mute=0`}
                                        className="absolute inset-0 w-full h-full border-0"
                                        allowFullScreen
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        title={`youtube-${stream.channelId}`}
                                    />
                                )}
                            </div>

                            {/* Compact control bar */}
                            <div className="flex items-center gap-1.5 px-2 py-1 shrink-0">
                                <div className={cn(
                                    'w-1.5 h-1.5 rounded-full shrink-0',
                                    stream.platform === 'twitch' ? 'bg-[#9146FF]' : 'bg-[#FF0000]'
                                )} />
                                <span className="text-xs font-medium text-foreground flex-1 truncate">
                                    {stream.displayName || stream.channelId}
                                </span>
                                <button
                                    onClick={() => removeStream(stream.id)}
                                    className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Portrait: vertical stack
    return (
        <div className="flex-1 flex flex-col gap-2 px-2 pt-2 pb-2 overflow-y-auto">
            {/* Global Volume Control */}
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-900/50 rounded-xl border border-white/5 shrink-0">
                <button
                    onClick={() => setMasterMuted(!masterMuted)}
                    className="text-muted-foreground hover:text-white transition-colors"
                >
                    {masterMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <Slider
                    value={[masterMuted ? 0 : masterVolume]}
                    onValueChange={(vals) => {
                        if (masterMuted) setMasterMuted(false);
                        setMasterVolume(vals[0]);
                    }}
                    max={100}
                    step={1}
                    className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
                    {masterMuted ? 0 : masterVolume}
                </span>
            </div>

            {/* Stream List */}
            {activeStreams.map((stream) => {
                const isExpanded = expandedStream === stream.id;

                return (
                    <div
                        key={stream.id}
                        className="rounded-xl overflow-hidden border border-white/5 bg-gray-900/40 shrink-0"
                    >
                        {/* Stream Embed */}
                        <div className="relative w-full aspect-video">
                            {stream.platform === 'twitch' ? (
                                <iframe
                                    src={`https://player.twitch.tv/?channel=${stream.channelId}&parent=${window.location.hostname}&muted=false`}
                                    className="w-full h-full border-0"
                                    allowFullScreen
                                    title={`twitch-${stream.channelId}`}
                                />
                            ) : (
                                <iframe
                                    src={`https://www.youtube.com/embed/${stream.videoId || stream.channelId}?autoplay=1&mute=0`}
                                    className="w-full h-full border-0"
                                    allowFullScreen
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    title={`youtube-${stream.channelId}`}
                                />
                            )}
                        </div>

                        {/* Stream Controls Bar */}
                        <div className="flex items-center gap-2 px-3 py-2">
                            <div className={cn(
                                'w-2 h-2 rounded-full',
                                stream.platform === 'twitch' ? 'bg-[#9146FF]' : 'bg-[#FF0000]'
                            )} />
                            <span className="text-sm font-medium text-foreground flex-1 truncate">
                                {stream.displayName || stream.channelId}
                            </span>

                            <button
                                onClick={() => setExpandedStream(isExpanded ? null : stream.id)}
                                className="p-1.5 text-muted-foreground hover:text-white transition-colors"
                            >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <button
                                onClick={() => removeStream(stream.id)}
                                className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
