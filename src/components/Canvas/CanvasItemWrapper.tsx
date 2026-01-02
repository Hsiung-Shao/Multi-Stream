import { useRef, useState, useEffect } from 'react';
import Draggable, { DraggableEventHandler } from 'react-draggable';
import { ResizableBox, ResizeCallbackData } from 'react-resizable';
import { useStreamStore } from '../../store/useStreamStore';
import { CanvasItem } from '../../types/canvas';
import { StreamBox } from '../StreamBox';
import { ChatBox } from './ChatBox';
import { Button } from '../ui/button';
import { X, GripHorizontal, Plus } from 'lucide-react';
import { cn } from '../ui/utils';
import { useUIStore } from '../../store/useUIStore';
import { useCanvasCollision } from '../../hooks/useCanvasCollision';
import { useTranslation } from 'react-i18next';

import 'react-resizable/css/styles.css';

interface CanvasItemWrapperProps {
    item: CanvasItem;
    className?: string;
}

export function CanvasItemWrapper({ item, className }: CanvasItemWrapperProps) {
    const { t } = useTranslation('common');
    const removeCanvasItem = useStreamStore(s => s.removeCanvasItem);
    const updateCanvasLayout = useStreamStore(s => s.updateCanvasLayout);
    const canvasItems = useStreamStore(s => s.canvasItems); // Used for collision
    const theme = useUIStore(s => s.theme);
    const masterVolume = useUIStore(s => s.masterVolume);
    const masterMuted = useUIStore(s => s.masterMuted);
    const streams = useStreamStore(s => s.streams);

    // Collision & Snapping Hook
    const { getSnappedPosition } = useCanvasCollision({
        items: canvasItems,
        currentItemId: item.i,
        snapThreshold: 20
    });

    // Internal state for smooth dragging/resizing without thrashing the store
    // Also helps if we want to add constraints or snap logic later
    const [bounds, setBounds] = useState({
        x: item.layout.x,
        y: item.layout.y,
        w: item.layout.w,
        h: item.layout.h
    });

    const nodeRef = useRef<HTMLDivElement>(null);

    // Sync bounds from store if changed externally (e.g. layout preset load)
    useEffect(() => {
        setBounds({
            x: item.layout.x,
            y: item.layout.y,
            w: item.layout.w,
            h: item.layout.h
        });
    }, [item.layout.x, item.layout.y, item.layout.w, item.layout.h]);

    const stream = item.contentId ? streams.find(s => s.id === item.contentId) : null;
    const hasContent = !!stream;

    // Determine if we should show the wrapper's header
    // StreamBox has its own header (integrated handle)
    // ChatBox and Empty Slot need the wrapper's header
    const showWrapperHeader = item.type !== 'stream' || !hasContent;

    const title = stream
        ? (stream.displayName || stream.name || stream.channelId || `Stream ${stream.id}`)
        : (item.type === 'stream' ? t('layout.empty_stream_slot') : t('layout.chat_window'));

    const typeLabel = item.type === 'stream' ? 'Stream' : 'Chat';

    const onDragStop: DraggableEventHandler = (_e, data) => {
        // Apply snapping
        const snapped = getSnappedPosition(data.x, data.y, bounds.w, bounds.h);

        setBounds(prev => ({ ...prev, x: snapped.x, y: snapped.y }));

        // Persist to store
        const newItems = canvasItems.map(ci =>
            ci.i === item.i
                ? { ...ci, layout: { ...ci.layout, x: snapped.x, y: snapped.y } }
                : ci
        );
        updateCanvasLayout(newItems);
    };

    const onResizeStop = (_e: any, data: any) => {
        const newW = data.size.width;
        const newH = data.size.height;

        setBounds(prev => ({ ...prev, w: newW, h: newH }));

        const newItems = canvasItems.map(ci =>
            ci.i === item.i
                ? { ...ci, layout: { ...ci.layout, w: newW, h: newH } }
                : ci
        );
        updateCanvasLayout(newItems);
    };

    return (
        <Draggable
            handle=".canvas-drag-handle"
            defaultPosition={{ x: item.layout.x, y: item.layout.y }}
            position={{ x: bounds.x, y: bounds.y }}
            onStop={onDragStop}
            nodeRef={nodeRef}
            bounds="parent" // Optional: Constrain to canvas container
        >
            <div
                ref={nodeRef}
                className={cn("absolute transition-shadow hover:z-20", className, { "z-10": !hasContent, "z-0": hasContent })} // absolute positioning is key for freeform
                style={{ width: bounds.w, height: bounds.h }} // Simple z-index management
            >
                <ResizableBox
                    width={bounds.w}
                    height={bounds.h}
                    onResizeStop={onResizeStop}
                    draggableOpts={{ enableUserSelectHack: false }}
                    minConstraints={[200, 150]}
                    maxConstraints={[2000, 2000]}
                    resizeHandles={['se']}
                    handle={
                        <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-50 group">
                            <div className="absolute bottom-1 right-1 w-2 h-2 bg-purple-500 rounded-full opacity-50 group-hover:opacity-100 transition-opacity ring-2 ring-white/20" />
                        </div>
                    }
                    className="w-full h-full"
                >
                    <div className={cn(
                        "flex flex-col w-full h-full rounded-md shadow-sm overflow-hidden border",
                        hasContent ? "bg-transparent border-transparent" : "bg-muted/40 border-dashed border-muted-foreground/30"
                    )}>
                        {/* Wrapper Header (for Chat & Empty) */}
                        {showWrapperHeader && (
                            <div className="canvas-drag-handle h-8 min-h-[32px] w-full bg-muted/80 flex items-center justify-between px-2 cursor-move select-none border-b shrink-0 group">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <GripHorizontal className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-xs font-medium truncate text-muted-foreground">
                                        {typeLabel}: {title}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                                        // Must rewrite onMouseDown to stop propagation to prevent Drag start if clicked
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(t('layout.confirm_remove_window'))) {
                                                removeCanvasItem(item.i);
                                            }
                                        }}
                                    >
                                        <X className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 w-full h-full min-h-0 relative">
                            {hasContent ? (
                                item.type === 'stream' ? (
                                    <StreamBox
                                        streamData={stream!}
                                        theme={theme}
                                        mode="stream-only"
                                        masterVolume={masterVolume}
                                        isMasterMuted={masterMuted}
                                        layoutStyle={{
                                            position: 'absolute',
                                            top: '0',
                                            left: '0',
                                            width: '100%',
                                            height: '100%'
                                        }}
                                        onRemove={() => {
                                            // Handle remove from StreamBox (optional: maybe remove item too?)
                                        }}
                                        onReload={() => { }}
                                        onToggleChat={() => { }}
                                        onSeparateChat={() => { }}
                                        streamIndex={-1}
                                    />
                                ) : (
                                    <ChatBox streamId={item.contentId!} />
                                )
                            ) : (
                                // Empty State
                                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/50 gap-2">
                                    <Plus className="w-8 h-8 opacity-20" />
                                    <span className="text-xs">
                                        {item.type === 'stream' ? t('layout.waiting_stream') : t('layout.waiting_chat')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </ResizableBox>
            </div>
        </Draggable>
    );
}
