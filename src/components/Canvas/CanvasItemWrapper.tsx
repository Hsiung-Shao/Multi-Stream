import { useRef } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { CanvasItem } from '../../types/canvas';
import { cn } from '../ui/utils';
import { blockRegistry } from './BlockRegistry';
import { WindowHeader } from './WindowParts/WindowHeader';
import { WindowContent } from './WindowParts/WindowContent';

interface CanvasItemWrapperProps {
    item: CanvasItem;
    // RGL Props (injected automatically)
    className?: string;
    style?: React.CSSProperties;
    onMouseDown?: React.MouseEventHandler;
    onMouseUp?: React.MouseEventHandler;
    onTouchEnd?: React.TouchEventHandler;
}

export function CanvasItemWrapper({
    item,
    className,
    style,
    onMouseDown,
    onMouseUp,
    onTouchEnd,
    ...props
}: CanvasItemWrapperProps) {
    const removeCanvasItem = useStreamStore(s => s.removeCanvasItem);
    const updateCanvasItem = useStreamStore(s => s.updateCanvasItem);
    const streams = useStreamStore(s => s.streams);

    const nodeRef = useRef<HTMLDivElement>(null);

    const stream = item.contentId ? streams.find(s => s.id === item.contentId) : null;
    const hasContent = !!stream;

    const blockDef = blockRegistry.get(item.type);
    const BlockComponent = blockDef?.component;

    const title = stream
        ? (stream.displayName || stream.name || stream.channelId || `Stream ${stream.id}`)
        : (blockDef?.label || 'Block');

    return (
        <div
            ref={nodeRef}
            className={cn(
                "w-full h-full group transition-shadow hover:z-50",
                className,
                // RGL adds `react-grid-item` class
                { "z-10": !hasContent, "z-0": hasContent }
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

                {/* Header / Controls */}
                <WindowHeader
                    title={title}
                    width={item.layout.w}
                    height={item.layout.h}
                    onRemove={() => removeCanvasItem(item.i)}
                />

                {/* Content */}
                <WindowContent
                    item={item}
                    BlockComponent={BlockComponent}
                    onUpdate={(updates) => updateCanvasItem(item.i, updates)}
                    onRemove={() => removeCanvasItem(item.i)}
                />
            </div>
        </div>
    );
}
