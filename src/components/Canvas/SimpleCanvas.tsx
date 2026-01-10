/**
 * SimpleCanvas - High performance canvas container
 * 24x24 grid that perfectly fits the viewport
 */

import { memo, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { DraggableWindow, CanvasWindow, WindowRenderProps } from './DraggableWindow';
import { calculateGridConfig, GridConfig } from './gridConfig';
import { checkCollision, checkPointCollision, Rect } from './collision';
import { cn } from '../ui/utils';
import { ScrollArea } from '../ui/scroll-area';
import { calculateRequiredRows } from '../../utils/layoutEngine';

interface SimpleCanvasProps {
    windows: CanvasWindow[];
    onWindowUpdate: (windows: CanvasWindow[]) => void;
    onWindowRemove: (id: string) => void;
    renderContent: (window: CanvasWindow, renderProps: WindowRenderProps) => ReactNode;
    className?: string;
}

export const SimpleCanvas = memo(function SimpleCanvas({
    windows,
    onWindowUpdate,
    onWindowRemove,
    renderContent,
    className
}: SimpleCanvasProps) {
    // Grid configuration - recalculates on resize
    const [gridConfig, setGridConfig] = useState<GridConfig>(() =>
        calculateGridConfig(window.innerWidth, window.innerHeight, calculateRequiredRows(windows.map(w => ({
            i: w.id,
            type: 'stream' as const,
            contentId: null,
            layout: { x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH }
        }))))
    );

    // Swap mode state (Drag based)
    const [dragSwapTargetId, setDragSwapTargetId] = useState<string | null>(null);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            const items = windows.map(w => ({
                i: w.id,
                type: 'stream' as const,
                contentId: null,
                layout: { x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH }
            }));
            setGridConfig(calculateGridConfig(window.innerWidth, window.innerHeight, calculateRequiredRows(items)));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [windows]); // Added windows dependency to recalc rows on window change

    // Recalculate grid when windows change (for infinite scrolling)
    useEffect(() => {
        const items = windows.map(w => ({
            i: w.id,
            type: 'stream' as const,
            contentId: null,
            layout: { x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH }
        }));
        setGridConfig(prev => calculateGridConfig(prev.containerWidth, prev.cellHeight * 24, calculateRequiredRows(items)));
    }, [windows]);

    // Container ref for pointer collision tracking
    const containerRef = useRef<HTMLDivElement>(null);

    // Convert windows to pixel positions for collision detection
    const windowPositions = useMemo(() => {
        return windows.map(w => ({
            id: w.id,
            position: {
                x: w.gridX * gridConfig.cellWidth,
                y: w.gridY * gridConfig.cellHeight,
                width: w.gridW * gridConfig.cellWidth,
                height: w.gridH * gridConfig.cellHeight
            }
        }));
    }, [windows, gridConfig]);

    // Check drag collision - NOW RETURNS ID or NULL
    const checkDragCollision = useCallback((
        id: string,
        x: number,
        y: number,
        width: number,
        height: number,
        screenX?: number,
        screenY?: number
    ): string | null => {
        // If screen coordinates are provided (Pointer Mode), use them
        if (screenX !== undefined && screenY !== undefined && containerRef.current) {
            const containerRect = containerRef.current.getBoundingClientRect();

            const pointerContainerX = screenX - containerRect.left;
            const pointerContainerY = screenY - containerRect.top;

            // Use Point Collision with normalized coordinates
            // Note: windowPositions are relative to the container 0,0
            // Since we ref the container div inside the ScrollArea, 
            // scroll offsets are already handled via getBoundingClientRect() of the moving container?
            // Wait. simple way: 
            // The ref must be on the scrolled content div (the one with the grid), not the wrapper.
            // If the div is the one mapped over windows, it moves up when styled?
            // OR SimpleCanvas renders a ScrollArea. The Child DIV is what we ref.
            // The Child DIV grows.
            // If ScrollArea implements native scroll, the child div moves up relative to viewport.
            // So containerRect.top moves up.
            // clientY is screen relative.
            // clientY - containerRect.top gives Y relative to top of container. Correct.

            // Check collision with POINTER position
            return checkPointCollision(id, pointerContainerX, pointerContainerY, windowPositions);
        }

        // Fallback to Rect Collision (Traditional)
        const rect: Rect = { x, y, width, height };
        return checkCollision(id, rect, windowPositions);
    }, [windowPositions]);


    // Check resize collision (still returns boolean)
    const checkResizeCollision = useCallback((
        id: string,
        x: number,
        y: number,
        width: number,
        height: number
    ): boolean => {
        const rect: Rect = { x, y, width, height };
        return checkCollision(id, rect, windowPositions) !== null;
    }, [windowPositions]);

    // Handle Drag Swap Hover
    const handleSwapHover = useCallback((_sourceId: string, targetId: string | null) => {
        setDragSwapTargetId(targetId);
    }, []);

    // Handle position change (Updated for Smart Swap)
    const handlePositionChange = useCallback((id: string, gridX: number, gridY: number, collisionId?: string | null) => {
        // 1. Identify Source Window
        const source = windows.find(w => w.id === id);
        if (!source) return;

        // Use the reported collisionId from the drag operation if available
        // This ensures consistent behavior with the visual feedback (green ring)
        const targetId = collisionId;

        if (targetId) {
            // SWAP DETECTED
            const target = windows.find(w => w.id === targetId);
            if (target) {
                // Perform Swap (Exchange Top-Left coordinates AND Dimensions)
                // This ensures "Content Swap" behavior where the layout grid structure remains unchanged.
                const updated = windows.map(w => {
                    if (w.id === id) {
                        // A takes B's position AND size
                        return {
                            ...w,
                            gridX: target.gridX,
                            gridY: target.gridY,
                            gridW: target.gridW,
                            gridH: target.gridH
                        };
                    }
                    if (w.id === targetId) {
                        // B takes A's *original* position AND size
                        return {
                            ...w,
                            gridX: source.gridX,
                            gridY: source.gridY,
                            gridW: source.gridW,
                            gridH: source.gridH
                        };
                    }
                    return w;
                });
                onWindowUpdate(updated);
                // Clear any drag state
                setDragSwapTargetId(null);
                return;
            }
        }

        // NO COLLISION (or simple move)
        const updated = windows.map(w =>
            w.id === id ? { ...w, gridX, gridY } : w
        );
        onWindowUpdate(updated);
        setDragSwapTargetId(null);

    }, [windows, onWindowUpdate]);

    // Handle resize
    const handleWindowResize = useCallback((id: string, gridX: number, gridY: number, gridW: number, gridH: number) => {
        // Enforce constraints
        const window = windows.find(w => w.id === id);
        if (window) {
            if (window.type === 'stream') {
                gridW = Math.max(6, gridW);
                gridH = Math.max(6, gridH);
            } else if (window.type === 'chat') {
                gridW = Math.max(3, Math.min(4, gridW)); // 3 <= W <= 4
                gridH = Math.max(6, gridH);
            }
        }

        const newWindows = windows.map(w => {
            if (w.id === id) {
                return { ...w, gridX, gridY, gridW, gridH };
            }
            return w;
        });
        onWindowUpdate(newWindows);
    }, [windows, onWindowUpdate]);

    return (
        <ScrollArea className={cn("h-full w-full bg-slate-950", className)}>
            <div
                ref={containerRef}
                className="relative"
                style={{
                    width: gridConfig.containerWidth,
                    height: gridConfig.containerHeight,
                    // contain: 'strict', // Contain strict might clip children or affect scrolling?
                    // Grid background
                    backgroundSize: `${gridConfig.cellWidth}px ${gridConfig.cellHeight}px`,
                    backgroundImage: `
                        linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
                    `
                }}
            >
                {/* Windows */}
                {windows.map(w => (
                    <DraggableWindow
                        key={w.id}
                        window={w}
                        gridConfig={gridConfig}
                        onPositionChange={handlePositionChange}
                        onSizeChange={handleWindowResize}
                        onRemove={onWindowRemove}
                        onSwapHover={handleSwapHover}
                        checkDragCollision={checkDragCollision}
                        checkResizeCollision={checkResizeCollision}
                        isSwapTarget={dragSwapTargetId === w.id}
                    >
                        {(renderProps) => renderContent(w, renderProps)}
                    </DraggableWindow>
                ))}
            </div>
        </ScrollArea>
    );
});

export type { CanvasWindow };
