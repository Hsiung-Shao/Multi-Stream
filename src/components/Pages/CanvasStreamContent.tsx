/**
 * CanvasStreamContent - Stream content for SimpleCanvas
 * Renders StreamIframe with floating pill-shaped header (matching WindowHeader style)
 */

import { memo, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { GripHorizontal, X, RefreshCw, Maximize2, Minimize2, Star, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WindowRenderProps } from '../Canvas';
import { StreamIframe } from '../Canvas/WindowParts/StreamIframe';
import { StreamChat } from '../StreamChat';
import { ChatPopoutButton } from '../ChatPopoutButton';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import type { StreamData } from '../../utils/streamUtils';
import { useUIStore } from '../../store/useUIStore';
import { useStreamStore } from '../../store/useStreamStore';
import { isSharedChatLayout, selectMainStreamItemId } from '../../utils/canvasItemOps';
import { SharedChatTabs } from '../Canvas/SharedChatTabs';

interface CanvasStreamContentProps {
    stream: StreamData;
    renderProps: WindowRenderProps;
    windowType?: 'stream' | 'chat';
    windowId?: string;
}

// 工具列本身是拖曳把手：新按鈕擋掉 pointerdown，點擊時才不會順手拖動視窗
const stopPointerDown = (e: React.PointerEvent) => e.stopPropagation();

// Divider subcomponent
const Divider = memo(function Divider() {
    return <div className="h-3 w-[1px] bg-white/20 mx-1" />;
});

export const CanvasStreamContent = memo(function CanvasStreamContent({
    stream,
    renderProps,
    windowType = 'stream',
    windowId,
}: CanvasStreamContentProps) {
    const { t } = useTranslation('common');
    const { dragHandlers, isDragging, isResizing, onRemove } = renderProps;
    const isChatWindow = windowType === 'chat';

    // 以下 selector 都回傳原始值：只有結果改變時才重繪，拖曳、音量變動都不會牽動
    const isTheater = useUIStore(s => windowId !== undefined && s.theaterWindowId === windowId);
    const isMain = useStreamStore(s => windowId !== undefined && selectMainStreamItemId(s.canvasItems) === windowId);
    const sharedChat = useStreamStore(s => isSharedChatLayout(s.canvasItems));
    const shownInSharedChat = useStreamStore(s =>
        !isChatWindow && isSharedChatLayout(s.canvasItems) && s.canvasItems.some(i => i.type === 'chat' && i.contentId === stream.id)
    );

    const handleTheater = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (windowId === undefined) return;
        const ui = useUIStore.getState();
        // 與快捷鍵 T 同一個狀態：theaterWindowId 存的是畫布視窗 id
        ui.setTheaterWindowId(ui.theaterWindowId === windowId ? null : windowId);
    }, [windowId]);

    const handleSetMain = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (windowId !== undefined) useStreamStore.getState().setMainCanvasItem(windowId);
    }, [windowId]);

    const [reloadKey, setReloadKey] = useState(0);
    const isReloadingRef = useRef(false);

    const reload = useCallback(() => {
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

    const handleReload = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        reload();
    }, [reload]);

    // 快捷鍵 R:useHotkeys 對「游標所在視窗」發 stream-reload-<串流 id>。
    // 在接上這個監聽之前,那個事件全專案沒有任何人在聽,所以 R 按下去毫無反應。
    useEffect(() => {
        const evt = `stream-reload-${stream.id}`;
        const onReload = () => reload();
        window.addEventListener(evt, onReload);
        return () => window.removeEventListener(evt, onReload);
    }, [stream.id, reload]);

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
    }, [stream.displayName, stream.channelId]);

    // 根節點的 id 是快捷鍵 F（視窗全螢幕）要找的元素：useHotkeys 用
    // document.getElementById(`stream-container-${hoveredWindowId}`) 取它來 requestFullscreen。
    // 在補上這個 id 之前，那個查詢永遠回 null，所以 F 按下去毫無反應。
    // 只掛在畫面視窗上：同一路串流的聊天室視窗共用同一個 stream.id，兩邊都掛會產生重複 id，
    // getElementById 只回第一個，全螢幕就可能開到聊天室去。
    return (
        <div
            id={isChatWindow ? undefined : `stream-container-${stream.id}`}
            className={cn("w-full h-full relative bg-slate-900 group", isChatWindow && "flex flex-col")}
        >
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
                <div className={cn("cursor-grab flex items-center text-white/70 hover:text-white mr-1 gap-2", isChatWindow && sharedChat && "mr-0")}>
                    <GripHorizontal size={14} className="shrink-0" />
                    {isChatWindow && sharedChat && windowId !== undefined ? null : (
                        <span className="text-[10px] font-medium max-w-[100px] truncate">
                            {title}
                        </span>
                    )}
                    {shownInSharedChat && (
                        <span className="shrink-0 text-sky-300" title={t('canvas.toolbar_in_chat')} aria-label={t('canvas.toolbar_in_chat')} role="img">
                            <MessageSquare size={11} />
                        </span>
                    )}
                </div>

                {/* 共用聊天室：標題換成分頁，切換聊天室顯示哪一路 */}
                {isChatWindow && sharedChat && windowId !== undefined && (
                    <SharedChatTabs chatItemId={windowId} activeStreamId={stream.id} />
                )}

                <Divider />

                {/* 另開原生聊天室：第三方 cookie 被封鎖時 iframe 內無法發言的逃生口 */}
                {isChatWindow && (
                    <ChatPopoutButton
                        platform={stream.platform}
                        channelId={stream.channelId}
                        videoId={stream.videoId}
                    />
                )}

                {/* 放大（劇院模式）與設為主畫面：原本只有快捷鍵 T 與拖曳換位，畫面上沒有入口 */}
                {!isChatWindow && windowId !== undefined && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-full hover:bg-white/20 text-white/70 hover:text-white nodrag"
                            onPointerDown={stopPointerDown}
                            onClick={handleTheater}
                            title={isTheater ? t('canvas.toolbar_exit_theater') : t('canvas.toolbar_theater')}
                            aria-pressed={isTheater}
                            data-tour="theater"
                        >
                            {isTheater ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                        </Button>
                        {!isMain && !isTheater && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-full hover:bg-white/20 text-white/70 hover:text-amber-300 nodrag"
                                onPointerDown={stopPointerDown}
                                onClick={handleSetMain}
                                title={t('canvas.toolbar_set_main')}
                            >
                                <Star size={12} />
                            </Button>
                        )}
                    </>
                )}

                {/* Reload Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-white/20 text-white/70 hover:text-white nodrag"
                    onClick={handleReload}
                    title={t('canvas.toolbar_reload')}
                >
                    <RefreshCw size={12} />
                </Button>

                {/* Remove Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-red-500/20 text-white/70 hover:text-red-400 nodrag"
                    onClick={handleRemove}
                    title={t('canvas.toolbar_remove')}
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
                        // 這個視窗已有自己的工具列（上方），popout 按鈕併在那裡，不要再疊一條
                        showToolbar={false}
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
