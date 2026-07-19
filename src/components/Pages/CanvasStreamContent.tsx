/**
 * CanvasStreamContent - Stream content for SimpleCanvas
 * Renders StreamIframe with floating pill-shaped header (matching WindowHeader style)
 */

import { memo, useState, useMemo, useCallback, useRef } from 'react';
import { GripHorizontal, X, RefreshCw } from 'lucide-react';
import { WindowRenderProps } from '../Canvas';
import { StreamIframe } from '../Canvas/WindowParts/StreamIframe';
import { StreamChat } from '../StreamChat';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import type { StreamData } from '../../utils/streamUtils';
import { useUIStore } from '../../store/useUIStore';

interface CanvasStreamContentProps {
    stream: StreamData;
    renderProps: WindowRenderProps;
    windowType?: 'stream' | 'chat';
    windowId?: string;
}

// Divider subcomponent
const Divider = memo(function Divider() {
    return <div className="h-3 w-[1px] bg-white/20 mx-1" />;
});

export const CanvasStreamContent = memo(function CanvasStreamContent({
    stream,
    renderProps,
    windowType = 'stream'
}: CanvasStreamContentProps) {
    const { dragHandlers, isDragging, isResizing, onRemove } = renderProps;

    const [reloadKey, setReloadKey] = useState(0);
    const isReloadingRef = useRef(false);

    const handleReload = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        // Debounce: prevent rapid reload clicks that can cause Twitch player issues
        if (isReloadingRef.current) return;
        isReloadingRef.current = true;

        // Small delay to allow cleanup before re-creation
        setTimeout(() => {
            setReloadKey(k => k + 1);
            // Reset after a short delay to allow new player to initialize
            setTimeout(() => {
                isReloadingRef.current = false;
            }, 500);
        }, 50);
    }, []);

    const handleRemove = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove();
    }, [onRemove]);

    // Master Volume Control
    const masterVolume = useUIStore(s => s.masterVolume);
    // masterMuted is now handled as logic-only in ControlPanel (visual state/batch trigger), not rendering state override.

    // Calculate effective volume and mute
    const effectiveVolume = Math.round((stream.volume ?? 100) * (masterVolume / 100));
    // Requirement: Individual Mute > Master Mute (Priority).
    // ...
    const effectiveMuted = stream.isMuted ?? false;

    const title = useMemo(() => {
        return stream.displayName || stream.channelId || 'Unknown';
    }, [stream.displayName, stream.channelId, effectiveVolume, effectiveMuted]);

    const isChatWindow = windowType === 'chat';

    return (
        <div className={cn("w-full h-full relative bg-slate-900 group", isChatWindow && "flex flex-col")}>
            {/* Stream windows keep floating controls; chat windows reserve space so Twitch UI is never covered. */}
            <div
                data-window-toolbar={windowType}
                className={cn(
                    "flex items-center gap-1 p-1 pl-3 pr-1",
                    "bg-black/80 backdrop-blur-md rounded-full",
                    "border border-white/10 shadow-lg",
                    "transition-opacity select-none",
                    isChatWindow
                        ? "relative z-10 m-1 mb-0 h-8 shrink-0 opacity-100 rounded-md"
                        : "absolute top-2 left-1/2 -translate-x-1/2 z-[60] opacity-0 group-hover:opacity-100",
                    isDragging && "opacity-100 bg-purple-900/80 cursor-grabbing"
                )}
                {...dragHandlers}
            >
                {/* Drag Handle with Title (Grid Size REMOVED) */}
                <div className="cursor-grab flex items-center text-white/70 hover:text-white mr-1 gap-2">
                    <GripHorizontal size={14} />
                    <span className="text-[10px] font-medium max-w-[100px] truncate">
                        {title}
                    </span>
                </div>

                <Divider />

                {/* Reload Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-white/20 text-white/70 hover:text-white nodrag"
                    onClick={handleReload}
                    title="重新載入"
                >
                    <RefreshCw size={12} />
                </Button>

                {/* Remove Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-red-500/20 text-white/70 hover:text-red-400 nodrag"
                    onClick={handleRemove}
                    title="移除"
                >
                    <X size={12} />
                </Button>
            </div>

            {/* Stream Content - fills entire area */}
            <div
                className={cn("w-full overflow-hidden", isChatWindow ? "flex-1 min-h-0" : "h-full")}
                style={{ pointerEvents: isDragging || isResizing ? 'none' : 'auto' }}
            >
                {isChatWindow ? (
                    <StreamChat
                        key={`chat-${reloadKey}`}
                        platform={stream.platform}
                        channelId={stream.channelId}
                        videoId={stream.videoId}
                        theme="dark"
                    />
                ) : (
                    <StreamIframe
                        key={`stream-${reloadKey}`}
                        streamData={stream}
                        volume={effectiveVolume}
                        isMuted={effectiveMuted}
                    />
                )}
            </div>
        </div>
    );
});
