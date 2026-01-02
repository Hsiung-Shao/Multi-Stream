import { useRef, useState, useEffect } from 'react';
import Draggable, { DraggableEventHandler } from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import { useStreamStore } from '../../store/useStreamStore';
import { CanvasItem } from '../../types/canvas';
import { Button } from '../ui/button';
import { X, GripHorizontal, AlertTriangle } from 'lucide-react'; // Added AlertTriangle
import { cn } from '../ui/utils';
import { useCanvasCollision } from '../../hooks/useCanvasCollision';
import { blockRegistry } from './BlockRegistry';

import { resolveCollision, snapToGrid } from '../../utils/canvasUtils';
import { findAdjacentItems, calculateMagneticResize } from '../../utils/magneticUtils';

import 'react-resizable/css/styles.css';

interface CanvasItemWrapperProps {
    item: CanvasItem;
    className?: string;
}

export function CanvasItemWrapper({ item, className }: CanvasItemWrapperProps) {
    const removeCanvasItem = useStreamStore(s => s.removeCanvasItem);
    const updateCanvasLayout = useStreamStore(s => s.updateCanvasLayout);
    const updateCanvasItem = useStreamStore(s => s.updateCanvasItem);
    const canvasItems = useStreamStore(s => s.canvasItems); // Used for collision
    const streams = useStreamStore(s => s.streams);

    // Grid Mode
    const gridMode = useStreamStore(s => s.gridMode);
    const gridSize = useStreamStore(s => s.gridSize);

    // Magnetic Mode
    const magneticMode = useStreamStore(s => s.magneticMode);

    // Collision & Snapping Hook
    const { getSnappedPosition } = useCanvasCollision({
        items: canvasItems,
        currentItemId: item.i,
        snapThreshold: 20
    });

    // Internal state for smooth dragging/resizing
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

    // Generic Block Logic
    const blockDef = blockRegistry.get(item.type);
    const BlockComponent = blockDef?.component;

    // Determine if we should show the wrapper's header
    // Rule: Show if block doesn't have custom header, OR if content is missing (so empty state needs header)
    const useCustomHeader = blockDef?.customHeader;
    const showWrapperHeader = !useCustomHeader || !hasContent;

    const title = stream
        ? (stream.displayName || stream.name || stream.channelId || `Stream ${stream.id}`)
        : (blockDef?.label || 'Block'); // Fallback title

    // Legacy removed: typeLabel




    const onDragStop: DraggableEventHandler = (_e, data) => {
        let newX = data.x;
        let newY = data.y;

        if (gridMode) {
            const snapped = snapToGrid({ x: newX, y: newY, w: bounds.w, h: bounds.h }, gridSize);
            newX = snapped.x;
            newY = snapped.y;
        } else {
            // Apply snapping (Ad-hoc magnetism)
            const snapped = getSnappedPosition(newX, newY, bounds.w, bounds.h);
            newX = snapped.x;
            newY = snapped.y;
        }

        setBounds(prev => ({ ...prev, x: newX, y: newY }));

        // 1. Update Current Item Layout locally first
        const currentUpdatedItem = { ...item, layout: { ...item.layout, x: newX, y: newY } };

        // 2. Resolve Collision (Push others)
        const allWithCurrentUpdated = canvasItems.map(ci =>
            ci.i === item.i ? currentUpdatedItem : ci
        );

        const resolvedItems = resolveCollision(currentUpdatedItem, allWithCurrentUpdated, item.layout);

        // 3. Update Store with ALL resolved items
        updateCanvasLayout(resolvedItems);
    };

    const onResizeStop = (_e: any, data: any) => {
        let newW = data.size.width;
        let newH = data.size.height;

        if (gridMode) {
            const snapped = snapToGrid({ x: bounds.x, y: bounds.y, w: newW, h: newH }, gridSize);
            newW = snapped.w;
            newH = snapped.h;
        }

        setBounds(prev => ({ ...prev, w: newW, h: newH }));

        // Base Update for Current Item
        const newLayout = { ...item.layout, w: newW, h: newH };
        let newItems = canvasItems.map(ci =>
            ci.i === item.i ? { ...ci, layout: newLayout } : ci
        );

        // Magnetic Resizing Logic
        if (magneticMode) {
            // Calculate Delta
            const deltaW = newW - item.layout.w;
            const deltaH = newH - item.layout.h;

            // Handle Width Change (East Handle)
            if (deltaW !== 0) {
                const neighbors = findAdjacentItems(item, canvasItems, 'e');
                const updates = calculateMagneticResize({ ...item, layout: newLayout }, neighbors, 'w', deltaW);

                updates.forEach(up => {
                    newItems = newItems.map(ni => ni.i === up.itemId ? { ...ni, layout: up.layout } : ni);
                });
            }

            // Handle Height Change (South Handle)
            if (deltaH !== 0) {
                const neighbors = findAdjacentItems(item, canvasItems, 's');
                const updates = calculateMagneticResize({ ...item, layout: newLayout }, neighbors, 'h', deltaH);

                updates.forEach(up => {
                    newItems = newItems.map(ni => ni.i === up.itemId ? { ...ni, layout: up.layout } : ni);
                });
            }
        }

        updateCanvasLayout(newItems);
    };

    return (
        <Draggable
            handle=".canvas-drag-handle"
            defaultPosition={{ x: item.layout.x, y: item.layout.y }}
            position={{ x: bounds.x, y: bounds.y }}
            onStop={onDragStop}
            nodeRef={nodeRef}
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
                        {/* Wrapper Header (If allowed by Block) */}
                        {showWrapperHeader && (
                            <div className="canvas-drag-handle h-8 min-h-[32px] w-full bg-muted/80 flex items-center justify-between px-2 cursor-move select-none border-b shrink-0 group">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <GripHorizontal className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-xs font-medium truncate text-muted-foreground">
                                        {blockDef?.label || 'Block'}: {title}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                                        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                                        onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            removeCanvasItem(item.i);
                                        }}
                                    >
                                        <X className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 w-full h-full min-h-0 relative">
                            {BlockComponent ? (
                                <BlockComponent
                                    item={item}
                                    onUpdate={(updates) => updateCanvasItem(item.i, updates)}
                                    onRemove={() => removeCanvasItem(item.i)}
                                // isInteracting can be passed if we track drag state
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-destructive">
                                    <AlertTriangle className="w-8 h-8 mb-2" />
                                    <span>Unknown Block Type: {item.type}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </ResizableBox>
            </div>
        </Draggable>
    );
}
