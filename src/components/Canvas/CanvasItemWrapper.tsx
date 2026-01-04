import { forwardRef } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { CanvasItem } from '../../types/canvas';
import { cn } from '../ui/utils';
import { blockRegistry } from './BlockRegistry';
import { WindowHeader } from './WindowParts/WindowHeader';
import { WindowContent } from './WindowParts/WindowContent';

interface CanvasItemWrapperProps {
    item: CanvasItem;
    resizingDimensions?: { w: number, h: number };
    // RGL Props (injected automatically)
    className?: string;
    style?: React.CSSProperties;
    onMouseDown?: React.MouseEventHandler;
    onMouseUp?: React.MouseEventHandler;
    onTouchEnd?: React.TouchEventHandler;
}

export const CanvasItemWrapper = forwardRef<HTMLDivElement, CanvasItemWrapperProps>(({
    item,
    resizingDimensions,
    className,
    style,
    onMouseDown,
    onMouseUp,
    onTouchEnd,
    ...props
}, ref) => {
    const removeCanvasItem = useStreamStore(s => s.removeCanvasItem);
    const updateCanvasItem = useStreamStore(s => s.updateCanvasItem);
    const streams = useStreamStore(s => s.streams);

    const stream = item.contentId ? streams.find(s => s.id === item.contentId) : null;
    const hasContent = !!stream;

    const blockDef = blockRegistry.get(item.type);
    const BlockComponent = blockDef?.component;

    const title = stream
        ? (stream.displayName || stream.name || stream.channelId || `Stream ${stream.id}`)
        : (blockDef?.label || 'Block');

    // StreamBox handles its own header (with volume controls etc.)
    // So we don't render WindowHeader here for streams THAT HAVE CONTENT
    const isStream = item.type === 'stream' && hasContent;

    // Always show grid dimensions (from layout or resizing state)
    const headerWidth = resizingDimensions?.w ?? item.layout.w;
    const headerHeight = resizingDimensions?.h ?? item.layout.h;

    return (
        <div
            ref={ref}
            className={cn(
                "w-full h-full group transition-shadow hover:z-50",
                className,
                // RGL adds `react-grid-item` class
                { "z-10": !hasContent, "z-0": hasContent },
                // Allow entire window dragging ONLY if empty
                !hasContent && "grid-item-drag-handle"
            )}
            style={style}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onTouchEnd={onTouchEnd}
            {...props}
        >
            <div className={cn(
                "w-full h-full rounded-xl overflow-hidden shadow-2xl transition-all border border-transparent group-hover:border-white/20 bg-black/40 backdrop-blur-sm relative",
                !hasContent && "border-white/10"
            )}>

                {/* Header / Controls - Only for non-stream blocks */}
                {!isStream && (
                    <WindowHeader
                        title={title}
                        width={headerWidth} // Only pass when resizing
                        height={headerHeight} // Only pass when resizing
                        windowType={item.type === 'chat' ? 'chat' : (item.type === 'stream' ? 'stream' : 'default')}
                        onRemove={() => removeCanvasItem(item.i)}
                        // Provide default/empty props for required controls
                        onReload={() => { /* No-op for blocks for now */ }}
                        // Pass undefined for optional controls to hide them on empty blocks if desired,
                        // or pass empty functions if we want to show disabled buttons.
                        // For empty streams, we probably don't want volume controls.
                        onToggleChat={undefined}
                        onToggleMute={undefined}
                        onVolumeChange={undefined}
                        isMuted={false}
                        volume={0}
                        chatVisible={false}
                    />
                )}

                {/* Content */}
                <WindowContent
                    item={item}
                    BlockComponent={BlockComponent}
                    onUpdate={(updates) => updateCanvasItem(item.i, updates)}
                    onRemove={() => removeCanvasItem(item.i)}
                    resizingDimensions={resizingDimensions} // Pass down
                />
            </div>
        </div>
    );
});

CanvasItemWrapper.displayName = 'CanvasItemWrapper';
