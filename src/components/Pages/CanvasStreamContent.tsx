/**
 * CanvasStreamContent - Stream content for SimpleCanvas
 * Renders StreamIframe with floating pill-shaped header (matching WindowHeader style)
 */

import { memo, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { GripHorizontal, X, RefreshCw, Maximize2, Minimize2, Star, MessageSquare, Volume2, VolumeX } from 'lucide-react';
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
import { mainStreamItemIdOf, sharedChatContentIdOf } from '../../utils/canvasItemOps';
import { ChatStreamSelect } from '../Canvas/ChatStreamSelect';
import { ChatLayoutMenu } from '../Canvas/ChatLayoutMenu';
import { RoomChatTabs } from '../Navigation/RoomChatTabs';
import { focusRoomItem, toggleRoomMode } from '../Navigation/roomActions';
import { MergedChat } from '../../features/chat/MergedChat';

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
    const hintsLearned = useUIStore(s => s.canvasHintsLearned);
    // 房間模式：播放器自己的介面（標題、控制列）蓋不得，我們的工具列與拖曳提示全部拿掉
    const isRoom = useUIStore(s => s.islandStyle === 'room');
    const roomStage = useUIStore(s => s.roomMode === 'stage');
    // 房間模式聊天欄選「合併」且畫布上有 Twitch 時，顯示合併聊天室取代原生 iframe
    const roomChatMerged = useUIStore(s => s.roomChatMerged);
    const hasTwitch = useStreamStore(s => s.streams.some(st => st.platform === 'twitch' && s.canvasItems.some(it => it.type === 'stream' && it.contentId === st.id)));
    const showMergedChat = isRoom && isChatWindow && (roomChatMerged || stream.platform === 'twitch') && hasTwitch;
    // 衍生值以 canvasItems 身分快取（見 canvasItemOps），多個視窗訂閱也只算一次
    const isMain = useStreamStore(s => windowId !== undefined && mainStreamItemIdOf(s.canvasItems) === windowId);
    const sharedChatContentId = useStreamStore(s => sharedChatContentIdOf(s.canvasItems));
    const shownInSharedChat = !isChatWindow && sharedChatContentId === stream.id;

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

    // 房間模式懸浮工具：靜音、設為焦點、放上舞台（舞台那路則切回平分）
    const handleToggleMute = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const store = useStreamStore.getState();
        const cur = store.streams.find(st => st.id === stream.id);
        store.updateStream(stream.id, { isMuted: !(cur?.isMuted ?? false) });
    }, [stream.id]);
    const handleRoomFocus = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (windowId !== undefined) focusRoomItem(windowId);
    }, [windowId]);
    const handleRoomPrimary = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (windowId === undefined) return;
        const ui = useUIStore.getState();
        if (ui.roomMode === 'stage') {
            // 舞台那路：回到平分；候場那路：放上舞台
            if (isMain) toggleRoomMode(); else focusRoomItem(windowId);
        } else {
            focusRoomItem(windowId);
            toggleRoomMode();
        }
    }, [windowId, isMain]);

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
            {isRoom ? (
                // 房間模式的聊天室：一排頻道標籤取代工具列；另開聊天室是第三方 cookie 被擋時的逃生口
                isChatWindow && windowId !== undefined ? (
                    <div className="relative z-10 flex h-9 shrink-0 items-center gap-1 border-b border-white/10 bg-black/80 px-1">
                        <RoomChatTabs chatItemId={windowId} activeStreamId={stream.id} />
                        <ChatLayoutMenu />
                        <ChatPopoutButton platform={stream.platform} channelId={stream.channelId} videoId={stream.videoId} />
                    </div>
                ) : null
            ) : (
                // Stream windows keep floating controls; chat windows reserve space so Twitch UI is never covered.
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
                    <div className={cn("cursor-grab flex items-center text-white/70 hover:text-white mr-1 gap-2", isChatWindow && "mr-0")}>
                        <GripHorizontal size={14} className="shrink-0" />
                        {isChatWindow && windowId !== undefined ? null : (
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

                    {/* 聊天室：標題換成下拉選單，切換聊天室顯示哪一路 */}
                    {isChatWindow && windowId !== undefined && (
                        <ChatStreamSelect chatItemId={windowId} activeStreamId={stream.id} />
                    )}

                    <Divider />

                    {/* 聊天室欄寬（窄／標準／寬，也可以直接拖聊天室左緣）與收合。作用在畫面上所有聊天室 */}
                    {isChatWindow && <ChatLayoutMenu />}

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
                        data-tour="reload"
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
                        data-tour="remove"
                    >
                        <X size={12} />
                    </Button>
                </div>
            )}

            {/* Stream Content - fills entire area */}
            <div
                className={cn("w-full overflow-hidden", isChatWindow ? "flex-1 min-h-0" : "h-full")}
                style={{ pointerEvents: isDragging || isResizing ? 'none' : 'auto' }}
            >
                {showMergedChat ? (
                    <MergedChat />
                ) : isChatWindow ? (
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

            {/* hover 操作說明：放在工具列正下方（底部是播放器控制列）。拖曳／縮放過幾次後收起。
                排在內容之後 append，出現或消失都不會搬動播放器節點 */}
            {!isChatWindow && !isRoom && !hintsLearned && !isTheater && (
                <div
                    data-hover-hint
                    className="absolute top-11 left-1/2 -translate-x-1/2 z-[59] max-w-[92%] truncate rounded-full border border-white/10 bg-black/75 px-2.5 py-0.5 text-[10px] text-white/80 pointer-events-none select-none opacity-0 transition-opacity group-hover:opacity-100"
                >
                    {t('canvas.hover_hint')}
                </div>
            )}
            {/* 房間模式每格的懸浮工具（照 2026-11 原型）：滑上去才出現在左上角。
                不再蓋整格的遮罩：遮罩會擋住 Twitch「點一下開始播放」，候場那路就播不出來。
                iframe 裡的滑鼠事件網頁收不到，但父層的 CSS :hover 判斷得到，所以滑鼠在播放器上時工具照樣出現 */}
            {isRoom && !isChatWindow && windowId !== undefined && (
                <RoomTileTools
                    title={title}
                    muted={effectiveMuted}
                    isStage={roomStage}
                    isMain={isMain}
                    dragHandlers={dragHandlers}
                    onToggleMute={handleToggleMute}
                    onPrimary={handleRoomPrimary}
                    onFocus={handleRoomFocus}
                    onRemove={handleRemove}
                />
            )}
        </div>
    );
});

interface RoomTileToolsProps {
    title: string;
    muted: boolean;
    isStage: boolean;
    isMain: boolean;
    dragHandlers: WindowRenderProps['dragHandlers'];
    onToggleMute: (e: React.MouseEvent) => void;
    onPrimary: (e: React.MouseEvent) => void;
    onFocus: (e: React.MouseEvent) => void;
    onRemove: (e: React.MouseEvent) => void;
}

const toolBtn = 'h-[30px] inline-flex items-center gap-1 rounded-lg border border-white/15 bg-[#0f1119]/90 px-2 text-xs text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300';

/** 房間模式每格左上的懸浮工具＋左下名稱（名稱不擋點擊，閒置時淡出） */
const RoomTileTools = memo(function RoomTileTools({ title, muted, isStage, isMain, dragHandlers, onToggleMute, onPrimary, onFocus, onRemove }: RoomTileToolsProps) {
    const { t } = useTranslation('common');
    const idle = useUIStore(s => s.roomIdle);
    return (
        <>
            <div
                data-room-tools
                className="absolute left-2 top-2 z-[56] flex max-w-[calc(100%-16px)] flex-wrap gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            >
                {!isStage && (
                    <button type="button" data-room-tool="drag" className={cn(toolBtn, 'cursor-grab')} aria-label={t('room.tool_drag', { name: title })} title={t('room.tool_drag', { name: title })} {...dragHandlers}>
                        <GripHorizontal size={14} />
                    </button>
                )}
                {!isStage && (
                    <button type="button" data-room-tool="focus" className={toolBtn} onPointerDown={stopPointerDown} onClick={onFocus}>
                        {t('room.tool_focus')}
                    </button>
                )}
                <button type="button" data-room-tool="mute" className={toolBtn} onPointerDown={stopPointerDown} onClick={onToggleMute} aria-pressed={muted}>
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />} {muted ? t('room.tool_unmute') : t('room.tool_mute')}
                </button>
                <button
                    type="button"
                    data-room-tool="stage"
                    className={toolBtn}
                    onPointerDown={stopPointerDown}
                    onClick={onPrimary}
                    aria-label={isStage && isMain ? t('room.mode_grid') : t('room.wing_to_stage', { name: title })}
                >
                    {isStage && isMain ? t('room.mode_grid') : t('room.to_stage')}
                </button>
                <button
                    type="button"
                    data-room-tool="close"
                    className={cn(toolBtn, 'text-red-300 hover:bg-red-500/20')}
                    onPointerDown={stopPointerDown}
                    onClick={onRemove}
                    aria-label={`${t('canvas.toolbar_remove')} ${title}`}
                >
                    <X size={14} /> {t('room.tool_close')}
                </button>
            </div>
            <div
                className={cn(
                    'pointer-events-none absolute bottom-2 left-2 z-[56] flex max-w-[calc(100%-16px)] items-center gap-2 rounded-lg bg-[#05060a]/70 px-2 py-1 text-xs transition-opacity duration-300',
                    idle ? 'opacity-0' : 'opacity-100',
                )}
            >
                <b className="truncate text-white">{title}</b>
                <span className={muted ? 'text-white/40' : 'text-emerald-400'}>{muted ? t('room.tool_muted') : t('room.tool_audio_on')}</span>
            </div>
        </>
    );
});
