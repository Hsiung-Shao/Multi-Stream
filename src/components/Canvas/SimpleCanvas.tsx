/**
 * SimpleCanvas - High performance canvas container
 * 24x24 grid that perfectly fits the viewport
 */

import { memo, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { DraggableWindow, CanvasWindow, WindowRenderProps } from './DraggableWindow';
import { calculateGridConfig, GridConfig } from './gridConfig';
import { checkCollision, Rect } from './collision';
import { cn } from '../ui/utils';

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
        calculateGridConfig(window.innerWidth, window.innerHeight)
    );

    // Swap mode state
    const [swapSourceId, setSwapSourceId] = useState<string | null>(null);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            setGridConfig(calculateGridConfig(window.innerWidth, window.innerHeight));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    // Check drag collision
    const checkDragCollision = useCallback((
        id: string,
        x: number,
        y: number,
        width: number,
        height: number
    ): boolean => {
        const rect: Rect = { x, y, width, height };
        return checkCollision(id, rect, windowPositions) !== null;
    }, [windowPositions]);

    // Check resize collision (now includes position for corner resizing)
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

    // Handle position change
    const handlePositionChange = useCallback((id: string, gridX: number, gridY: number) => {
        const updated = windows.map(w =>
            w.id === id ? { ...w, gridX, gridY } : w
        );
        onWindowUpdate(updated);
    }, [windows, onWindowUpdate]);

    // Handle size change (now includes position for corner resizing)
    const handleSizeChange = useCallback((id: string, gridX: number, gridY: number, gridW: number, gridH: number) => {
        const updated = windows.map(w =>
            w.id === id ? { ...w, gridX, gridY, gridW, gridH } : w
        );
        onWindowUpdate(updated);
    }, [windows, onWindowUpdate]);

    // Handle swap request
    const handleSwapRequest = useCallback((id: string) => {
        if (!swapSourceId) {
            // First click - set source
            setSwapSourceId(id);
        } else if (swapSourceId === id) {
            // Cancel swap
            setSwapSourceId(null);
        } else {
            // Second click - perform swap
            const source = windows.find(w => w.id === swapSourceId);
            const target = windows.find(w => w.id === id);

            if (source && target) {
                const updated = windows.map(w => {
                    if (w.id === swapSourceId) {
                        return {
                            ...w,
                            gridX: target.gridX,
                            gridY: target.gridY,
                            gridW: target.gridW,
                            gridH: target.gridH
                        };
                    }
                    if (w.id === id) {
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
            }
            setSwapSourceId(null);
        }
    }, [swapSourceId, windows, onWindowUpdate]);

    // Cancel swap on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && swapSourceId) {
                setSwapSourceId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [swapSourceId]);

    return (
        <div
            className={cn(
                "relative overflow-hidden bg-slate-950",
                className
            )}
            style={{
                width: gridConfig.containerWidth,
                height: gridConfig.containerHeight,
                contain: 'strict',
                // Grid background
                backgroundSize: `${gridConfig.cellWidth}px ${gridConfig.cellHeight}px`,
                backgroundImage: `
                    linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
                `
            }}
        >
            {/* Swap mode indicator */}
            {swapSourceId && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-500/90 text-white px-4 py-2 rounded-lg text-sm shadow-lg">
                    選擇要交換的視窗 (按 ESC 取消)
                </div>
            )}

            {/* Windows */}
            {windows.map(w => (
                <DraggableWindow
                    key={w.id}
                    window={w}
                    gridConfig={gridConfig}
                    onPositionChange={handlePositionChange}
                    onSizeChange={handleSizeChange}
                    onRemove={onWindowRemove}
                    onSwapRequest={handleSwapRequest}
                    checkDragCollision={checkDragCollision}
                    checkResizeCollision={checkResizeCollision}
                    isSwapTarget={swapSourceId !== null && swapSourceId !== w.id}
                >
                    {(renderProps) => renderContent(w, renderProps)}
                </DraggableWindow>
            ))}
        </div>
    );
});

export type { CanvasWindow };
