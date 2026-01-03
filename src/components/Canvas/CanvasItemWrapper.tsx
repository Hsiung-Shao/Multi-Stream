import { useRef } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { CanvasItem } from '../../types/canvas';
import { Button } from '../ui/button';
import { X, GripHorizontal, AlertTriangle } from 'lucide-react';
import { cn } from '../ui/utils';
import { blockRegistry } from './BlockRegistry';

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
                "w-full h-full rounded-xl overflow-hidden shadow-2xl transition-all border border-transparent group-hover:border-white/20 bg-black/40 backdrop-blur-sm",
                !hasContent && "border-white/10"
            )}>

                {/* Control Bar */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 p-1 pl-3 pr-1 bg-black/80 backdrop-blur-md rounded-full border border-white/10 shadow-lg">
                    {/* Drag Handle - Must match draggableHandle in GridEngine */}
                    <div className="grid-item-drag-handle cursor-move mr-2 flex items-center text-white/70 hover:text-white">
                        <GripHorizontal size={14} />
                        <span className="text-[10px] font-medium ml-2 max-w-[100px] truncate select-none">
                            {title}
                        </span>
                        <span className="text-xs font-bold text-yellow-300 ml-2 select-none">
                            {item.layout.w} x {item.layout.h}
                        </span>
                    </div>

                    <div className="h-3 w-[1px] bg-white/20 mx-1" />

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full hover:bg-white/20 text-white/70 hover:text-white"
                        onMouseDown={(e) => e.stopPropagation()} // Prevent drag start on button click
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            removeCanvasItem(item.i);
                        }}
                    >
                        <X size={12} />
                    </Button>
                </div>

                {/* Content */}
                <div className="w-full h-full">
                    {BlockComponent ? (
                        <BlockComponent
                            item={item}
                            onUpdate={(updates) => updateCanvasItem(item.i, updates)}
                            onRemove={() => removeCanvasItem(item.i)}
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-destructive">
                            <AlertTriangle className="w-8 h-8 mb-2" />
                            <span>Unknown Block</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
