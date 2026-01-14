/**
 * DraggableWindow - High performance draggable and resizable window
 * Uses CSS Transform for GPU acceleration
 * Features smooth dragging with ghost preview at snap position
 * Supports resizing from all 4 corners
 * 
 * HEADERLESS VERSION - drag handlers are passed to children via render props
 */

import { memo, useCallback, useMemo, ReactNode, useEffect } from 'react';
import { useDrag } from './useDrag';
import { useResize } from './useResize';
import { GridConfig, PixelPosition } from './gridConfig';
import { cn } from '../ui/utils';

export interface CanvasWindow {
    id: string;
    gridX: number;
    gridY: number;
    gridW: number;
    gridH: number;
    contentId?: number;
    type: 'stream' | 'chat';
    title?: string;
}

export interface DragHandlers {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
}

export interface WindowRenderProps {
    dragHandlers: DragHandlers;
    isDragging: boolean;
    isResizing: boolean;
    gridW: number;
    gridH: number;
    onRemove: () => void;
}

interface DraggableWindowProps {
    window: CanvasWindow;
    gridConfig: GridConfig;
    children: ReactNode | ((props: WindowRenderProps) => ReactNode);
    onPositionChange: (id: string, gridX: number, gridY: number, collisionId?: string | null) => void;
    onSizeChange: (id: string, gridX: number, gridY: number, gridW: number, gridH: number) => void;
    onRemove: (id: string) => void;
    onSwapHover: (sourceId: string, targetId: string | null) => void;
    checkDragCollision: (id: string, x: number, y: number, width: number, height: number, screenX?: number, screenY?: number) => string | null;
    checkResizeCollision: (id: string, x: number, y: number, width: number, height: number) => boolean;
    isSwapTarget?: boolean;
    isTheaterMode?: boolean;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

export const DraggableWindow = memo(function DraggableWindow({
    window,
    gridConfig,
    children,
    onPositionChange,
    onSizeChange,
    onRemove,
    onSwapHover,
    checkDragCollision,
    checkResizeCollision,
    isSwapTarget,
    isTheaterMode,
    onMouseEnter,
    onMouseLeave
}: DraggableWindowProps) {
    const { cellWidth, cellHeight } = gridConfig;

    // Calculate pixel position from grid position
    const pixelPos: PixelPosition = useMemo(() => ({
        x: window.gridX * cellWidth,
        y: window.gridY * cellHeight,
        width: window.gridW * cellWidth,
        height: window.gridH * cellHeight
    }), [window.gridX, window.gridY, window.gridW, window.gridH, cellWidth, cellHeight]);

    // Drag collision checker (returns collision ID or null)
    const dragCollisionCheck = useCallback((x: number, y: number, screenX?: number, screenY?: number) => {
        return checkDragCollision(window.id, x, y, pixelPos.width, pixelPos.height, screenX, screenY);
    }, [window.id, pixelPos.width, pixelPos.height, checkDragCollision]);

    // Resize collision checker
    const resizeCollisionCheck = useCallback((x: number, y: number, width: number, height: number) => {
        return checkResizeCollision(window.id, x, y, width, height);
    }, [window.id, checkResizeCollision]);

    // Handle drag end - convert pixels back to grid
    const handleDragEnd = useCallback((x: number, y: number, collisionId: string | null) => {
        const gridX = Math.round(x / cellWidth);
        const gridY = Math.round(y / cellHeight);

        onPositionChange(window.id, gridX, gridY, collisionId);
        // Clear swap hover
        onSwapHover(window.id, null);
    }, [window.id, cellWidth, cellHeight, onPositionChange, onSwapHover]);

    // Handle resize end - convert pixels back to grid (now includes position)
    const handleResizeEnd = useCallback((x: number, y: number, width: number, height: number) => {
        const gridX = Math.round(x / cellWidth);
        const gridY = Math.round(y / cellHeight);
        const gridW = Math.round(width / cellWidth);
        const gridH = Math.round(height / cellHeight);
        onSizeChange(window.id, gridX, gridY, gridW, gridH);
    }, [window.id, cellWidth, cellHeight, onSizeChange]);

    // Drag hook - returns both smooth position and snap position AND collisionId
    const { position, snapPosition, collisionId, isDragging, dragHandlers } = useDrag({
        cellWidth,
        cellHeight,
        currentX: pixelPos.x,
        currentY: pixelPos.y,
        width: pixelPos.width,
        height: pixelPos.height,
        onDragEnd: handleDragEnd,
        checkCollision: dragCollisionCheck,
        maxRows: 1000 // Allow dragging beyond current bounds to trigger expansion
    });

    // Notify parent of swap hover state
    useEffect(() => {
        if (isDragging) {
            onSwapHover(window.id, collisionId);
        }
    }, [collisionId, isDragging, window.id, onSwapHover]);

    // Resize hook - now returns cornerHandlers instead of single resizeHandlers
    const { size, position: resizePos, isResizing, cornerHandlers } = useResize({
        cellWidth,
        cellHeight,
        currentWidth: pixelPos.width,
        currentHeight: pixelPos.height,
        currentX: pixelPos.x,
        currentY: pixelPos.y,
        onResizeEnd: handleResizeEnd,
        checkCollision: resizeCollisionCheck
    });

    // Compute actual display position (use resize position when resizing)
    const displayX = isResizing ? resizePos.x : position.x;
    const displayY = isResizing ? resizePos.y : position.y;

    // Handle remove
    const handleRemove = useCallback(() => {
        onRemove(window.id);
    }, [window.id, onRemove]);

    // Render props for children
    const renderProps: WindowRenderProps = {
        dragHandlers,
        isDragging,
        isResizing,
        gridW: Math.round(size.width / cellWidth),
        gridH: Math.round(size.height / cellHeight),
        onRemove: handleRemove
    };

    // Render children - support both ReactNode and render props pattern
    const renderedChildren = typeof children === 'function' ? children(renderProps) : children;

    // Corner handle base styles
    const cornerHandleClass = cn(
        "absolute w-4 h-4 z-10",
        "opacity-0 group-hover:opacity-100 transition-opacity",
        "hover:bg-blue-500/30",
        isResizing && "opacity-100 bg-blue-500/50"
    );

    return (
        <>
            {/* Ghost Preview - shows where window will land */}
            {isDragging && (
                <div
                    className="absolute rounded-lg border-2 border-dashed border-purple-400/60 bg-purple-500/10 pointer-events-none"
                    style={{
                        transform: `translate3d(${snapPosition.x}px, ${snapPosition.y}px, 0)`,
                        width: size.width,
                        height: size.height,
                        transition: 'transform 0.1s ease-out'
                    }}
                />
            )}

            {/* Actual Window - NO INTERNAL HEADER */}
            <div
                className={cn(
                    "absolute rounded-lg overflow-hidden border border-white/10 bg-slate-900/95",
                    "shadow-lg group",
                    isDragging && "shadow-2xl border-purple-500/50 z-50 opacity-90",
                    isResizing && "border-blue-500/50 z-50",
                    isSwapTarget && "ring-2 ring-green-500 ring-offset-2 ring-offset-slate-950",
                    isTheaterMode && "z-[100] border-purple-500 shadow-2xl"
                )}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                style={isTheaterMode ? {
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    transform: 'none',
                    zIndex: 100,
                } : {
                    transform: `translate3d(${displayX}px, ${displayY}px, 0)`,
                    width: size.width,
                    height: size.height,
                    willChange: isDragging || isResizing ? 'transform, width, height' : 'auto',
                    contain: 'layout style paint',
                    transition: (isDragging || isResizing) ? 'none' : 'transform 0.15s ease-out, width 0.15s ease-out, height 0.15s ease-out'
                }}
            >
                {/* Content fills entire window */}
                <div
                    className="w-full h-full overflow-hidden"
                    style={{ pointerEvents: isDragging || isResizing ? 'none' : 'auto' }}
                >
                    {renderedChildren}
                </div>

                {/* Four Corner Resize Handles */}
                {/* NW - Top Left */}
                <div
                    className={cn(cornerHandleClass, "top-0 left-0 cursor-nw-resize")}
                    {...cornerHandlers.nw}
                >
                    <div className="absolute top-0.5 left-0.5 w-2 h-2 border-l-2 border-t-2 border-white/40" />
                </div>

                {/* NE - Top Right */}
                <div
                    className={cn(cornerHandleClass, "top-0 right-0 cursor-ne-resize")}
                    {...cornerHandlers.ne}
                >
                    <div className="absolute top-0.5 right-0.5 w-2 h-2 border-r-2 border-t-2 border-white/40" />
                </div>

                {/* SW - Bottom Left */}
                <div
                    className={cn(cornerHandleClass, "bottom-0 left-0 cursor-sw-resize")}
                    {...cornerHandlers.sw}
                >
                    <div className="absolute bottom-0.5 left-0.5 w-2 h-2 border-l-2 border-b-2 border-white/40" />
                </div>

                {/* SE - Bottom Right */}
                <div
                    className={cn(cornerHandleClass, "bottom-0 right-0 cursor-se-resize")}
                    {...cornerHandlers.se}
                >
                    <div className="absolute bottom-0.5 right-0.5 w-2 h-2 border-r-2 border-b-2 border-white/40" />
                </div>

                {/* Size indicator during resize */}
                {isResizing && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white text-xs px-3 py-1.5 rounded z-20">
                        {Math.round(size.width / cellWidth)} × {Math.round(size.height / cellHeight)}
                    </div>
                )}
            </div>
        </>
    );
});
