/**
 * SimpleCanvas - High performance canvas container
 * 24x24 grid that perfectly fits the viewport
 */

import { memo, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { DraggableWindow, CanvasWindow, WindowRenderProps } from './DraggableWindow';
import { calculateGridConfig, GridConfig, GRID_COLS, PixelPosition } from './gridConfig';
import { checkCollision, checkPointCollision, Rect } from './collision';
import { resolvePushResize } from './pushResize';
import { cn } from '../ui/utils';
import { ScrollArea } from '../ui/scroll-area';
import { calculateRequiredRows } from '../../utils/layoutEngine';
import { useUIStore } from '../../store/useUIStore';

/**
 * 各類型視窗的格線尺寸限制。使用者拖出來的尺寸與推擠時能壓縮到的下限都以此為準——
 * 兩者若各寫一份會逐漸漂移，導致推擠算出的佈局在落地時又被夾成另一個值。
 */
const SIZE_LIMITS = {
    stream: { minW: 6, minH: 6, maxW: Infinity },
    chat: { minW: 3, minH: 6, maxW: 4 },
} as const;

export const limitsOf = (w: CanvasWindow) => SIZE_LIMITS[w.type] ?? SIZE_LIMITS.stream;

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

    const theaterWindowId = useUIStore(s => s.theaterWindowId);

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


    // resize 過程中鄰居的讓位預覽（只畫輪廓，放開才落地）
    const [resizeGhosts, setResizeGhosts] = useState<Record<string, PixelPosition> | null>(null);

    // 把使用者拖出來的尺寸夾進該類型視窗的合法範圍
    const clampDesired = useCallback((w: CanvasWindow, gridW: number, gridH: number) => {
        const { minW, minH, maxW } = limitsOf(w);
        return { w: Math.max(minW, Math.min(maxW, gridW)), h: Math.max(minH, gridH) };
    }, []);

    const solveResize = useCallback((id: string, gridX: number, gridY: number, gridW: number, gridH: number) => {
        const target = windows.find(w => w.id === id);
        if (!target) return null;
        const size = clampDesired(target, gridW, gridH);
        return resolvePushResize(
            windows,
            id,
            { x: gridX, y: gridY, w: size.w, h: size.h },
            {
                gridCols: GRID_COLS,
                minSize: limitsOf,
                // 縮小留下的空白由連鎖填補消化時，優先把空間讓給直播畫面
                prefer: w => (w.type === 'stream' ? 1 : 0),
            },
        );
    }, [windows, clampDesired]);

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

    // resize 拖曳中：算出鄰居讓位後的位置，但只拿來畫 ghost
    const handleSizePreview = useCallback((id: string, gridX: number, gridY: number, gridW: number, gridH: number) => {
        const solved = solveResize(id, gridX, gridY, gridW, gridH);
        if (!solved) return;

        const ghosts: Record<string, PixelPosition> = {};
        for (const next of solved.windows) {
            if (next.id === id) continue;
            const before = windows.find(w => w.id === next.id);
            if (!before) continue;
            const moved = before.gridX !== next.gridX || before.gridY !== next.gridY
                || before.gridW !== next.gridW || before.gridH !== next.gridH;
            if (!moved) continue;
            ghosts[next.id] = {
                x: next.gridX * gridConfig.cellWidth,
                y: next.gridY * gridConfig.cellHeight,
                width: next.gridW * gridConfig.cellWidth,
                height: next.gridH * gridConfig.cellHeight,
            };
        }

        setResizeGhosts(Object.keys(ghosts).length > 0 ? ghosts : null);
    }, [solveResize, windows, gridConfig.cellWidth, gridConfig.cellHeight]);

    // resize 結束：把推擠結果真正落地
    const handleWindowResize = useCallback((id: string, gridX: number, gridY: number, gridW: number, gridH: number) => {
        setResizeGhosts(null);
        const solved = solveResize(id, gridX, gridY, gridW, gridH);
        if (!solved) return;
        onWindowUpdate(solved.windows);
    }, [solveResize, onWindowUpdate]);

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
                        onSizePreview={handleSizePreview}
                        ghostRect={resizeGhosts?.[w.id] ?? null}
                        onRemove={onWindowRemove}
                        onSwapHover={handleSwapHover}
                        checkDragCollision={checkDragCollision}
                        isSwapTarget={dragSwapTargetId === w.id}
                        isTheaterMode={theaterWindowId === w.id}
                        onMouseEnter={() => useUIStore.getState().setHoveredWindowId(w.contentId ? w.contentId.toString() : w.id)}
                        onMouseLeave={() => useUIStore.getState().setHoveredWindowId(null)}
                    >
                        {(renderProps) => renderContent(w, renderProps)}
                    </DraggableWindow>
                ))}
            </div>
        </ScrollArea>
    );
});

export type { CanvasWindow };
