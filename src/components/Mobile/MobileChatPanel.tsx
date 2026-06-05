import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStreamStore } from '../../store/useStreamStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { StreamChat } from '../StreamChat';
import { MessageSquare } from 'lucide-react';
import { cn } from '../ui/utils';

export function MobileChatPanel() {
    const { t } = useTranslation();
    const streams = useStreamStore(s => s.streams);
    const theme = useEffectiveTheme();

    const activeStreams = streams.filter(s => s.channelId);
    const [selectedStreamId, setSelectedStreamId] = useState<number | null>(
        activeStreams.length > 0 ? activeStreams[0].id : null
    );

    const selectedStream = activeStreams.find(s => s.id === selectedStreamId) || activeStreams[0];

    if (activeStreams.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gray-900 border border-white/10 flex items-center justify-center mb-6">
                    <MessageSquare className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                    {t('mobile.chat.empty_title', '尚無聊天室')}
                </h2>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                    {t('mobile.chat.empty_desc', '新增串流後即可在此查看聊天室')}
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Stream Tabs */}
            {activeStreams.length > 1 && (
                <div className="flex gap-1 px-2 py-2 overflow-x-auto scrollbar-none border-b border-white/5 shrink-0">
                    {activeStreams.map((stream) => (
                        <button
                            key={stream.id}
                            onClick={() => setSelectedStreamId(stream.id)}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0',
                                selectedStreamId === stream.id
                                    ? 'bg-primary text-white'
                                    : 'bg-gray-900/50 text-muted-foreground active:bg-gray-800'
                            )}
                        >
                            <div className={cn(
                                'w-1.5 h-1.5 rounded-full',
                                stream.platform === 'twitch' ? 'bg-[#9146FF]' : 'bg-[#FF0000]'
                            )} />
                            {stream.displayName || stream.channelId}
                        </button>
                    ))}
                </div>
            )}

            {/* Chat iframe — uses flex-1 + min-h-0 to fill remaining space exactly */}
            {selectedStream && (
                <div className="flex-1 min-h-0">
                    <StreamChat
                        platform={selectedStream.platform}
                        channelId={selectedStream.channelId}
                        videoId={selectedStream.videoId}
                        theme={theme}
                        className="h-full"
                    />
                </div>
            )}
        </div>
    );
}
