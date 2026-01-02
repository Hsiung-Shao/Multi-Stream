import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { StreamChat } from '../StreamChat';

interface ChatBoxProps {
    streamId: number;
}

export function ChatBox({ streamId }: ChatBoxProps) {
    const stream = useStreamStore(s => s.streams.find(st => st.id === streamId));
    const theme = useUIStore(s => s.theme);

    if (!stream) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
                Stream Not Found ({streamId})
            </div>
        );
    }

    // Only render if we have channel info
    if (stream.platform === 'twitch' && !stream.channelId) return null;
    if (stream.platform === 'youtube' && !stream.videoId) return null;

    return (
        <div className="w-full h-full bg-background relative flex flex-col">
            {/* Header / Info bar could go here, or handled by wrapper */}
            <div className="flex-1 min-h-0">
                <StreamChat
                    platform={stream.platform}
                    channelId={stream.channelId}
                    videoId={stream.videoId}
                    theme={theme}
                />
            </div>
        </div>
    );
}
