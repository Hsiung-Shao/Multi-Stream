/**
 * useResize hook - High performance resize handling from all 4 corners
 * Uses Pointer Events + requestAnimationFrame for smooth resizing
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { snapToGrid, GRID_COLS, GRID_ROWS } from './gridConfig';

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface ResizeState {
    isResizing: boolean;
    corner: ResizeCorner;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startPosX: number;
    startPosY: number;
}

interface UseResizeOptions {
    cellWidth: number;
    cellHeight: number;
    currentWidth: number;
    currentHeight: number;
    currentX: number;
    currentY: number;
    minGridW?: number;
    minGridH?: number;
    onResizeEnd: (x: number, y: number, width: number, height: number) => void;
    /** 拖曳過程中回報目前尺寸，供上層預覽鄰居讓位後的位置 */
    onResizePreview?: (x: number, y: number, width: number, height: number) => void;
}

export function useResize(options: UseResizeOptions) {
    const {
        cellWidth,
        cellHeight,
        currentWidth,
        currentHeight,
        currentX,
        currentY,
        minGridW = 4,
        minGridH = 3,
        onResizeEnd,
        onResizePreview
    } = options;

    const [size, setSize] = useState({ width: currentWidth, height: currentHeight });
    const [position, setPosition] = useState({ x: currentX, y: currentY });
    const [isResizing, setIsResizing] = useState(false);

    const resizeState = useRef<ResizeState>({
        isResizing: false,
        corner: 'se',
        startX: 0,
        startY: 0,
        startWidth: 0,
        startHeight: 0,
        startPosX: 0,
        startPosY: 0
    });
    const rafRef = useRef<number | undefined>(undefined);

    // Create handler for specific corner
    const createCornerHandlers = useCallback((corner: ResizeCorner) => {
        const handlePointerDown = (e: React.PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            (e.target as HTMLElement).setPointerCapture(e.pointerId);

            resizeState.current = {
                isResizing: true,
                corner,
                startX: e.clientX,
                startY: e.clientY,
                startWidth: currentWidth,
                startHeight: currentHeight,
                startPosX: currentX,
                startPosY: currentY
            };

            setIsResizing(true);
        };

        const handlePointerMove = (e: React.PointerEvent) => {
            if (!resizeState.current.isResizing) return;

            e.preventDefault();

            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }

            rafRef.current = requestAnimationFrame(() => {
                const deltaX = e.clientX - resizeState.current.startX;
                const deltaY = e.clientY - resizeState.current.startY;
                const corner = resizeState.current.corner;

                let newWidth = resizeState.current.startWidth;
                let newHeight = resizeState.current.startHeight;
                let newX = resizeState.current.startPosX;
                let newY = resizeState.current.startPosY;

                // Calculate new dimensions based on corner
                if (corner === 'se') {
                    newWidth += deltaX;
                    newHeight += deltaY;
                } else if (corner === 'sw') {
                    newWidth -= deltaX;
                    newX += deltaX;
                    newHeight += deltaY;
                } else if (corner === 'ne') {
                    newWidth += deltaX;
                    newHeight -= deltaY;
                    newY += deltaY;
                } else if (corner === 'nw') {
                    newWidth -= deltaX;
                    newX += deltaX;
                    newHeight -= deltaY;
                    newY += deltaY;
                }

                // Snap to grid
                newWidth = snapToGrid(newWidth, cellWidth);
                newHeight = snapToGrid(newHeight, cellHeight);
                newX = snapToGrid(newX, cellWidth);
                newY = snapToGrid(newY, cellHeight);

                // Enforce minimums
                const minWidth = minGridW * cellWidth;
                const minHeight = minGridH * cellHeight;

                // For corners that move position, prevent going below minimum
                if (corner === 'nw' || corner === 'sw') {
                    const maxX = resizeState.current.startPosX + resizeState.current.startWidth - minWidth;
                    if (newX > maxX) {
                        newX = maxX;
                        newWidth = minWidth;
                    }
                }
                if (corner === 'nw' || corner === 'ne') {
                    const maxY = resizeState.current.startPosY + resizeState.current.startHeight - minHeight;
                    if (newY > maxY) {
                        newY = maxY;
                        newHeight = minHeight;
                    }
                }

                newWidth = Math.max(minWidth, newWidth);
                newHeight = Math.max(minHeight, newHeight);

                // Clamp position to grid bounds
                newX = Math.max(0, newX);
                newY = Math.max(0, newY);

                // Clamp size to not exceed grid bounds
                const maxWidth = (GRID_COLS * cellWidth) - newX;
                const maxHeight = (GRID_ROWS * cellHeight) - newY;
                newWidth = Math.min(newWidth, maxWidth);
                newHeight = Math.min(newHeight, maxHeight);

                // 這裡刻意不再偵測與鄰居的碰撞。舊版一碰到就整個 return，視窗完全不動也沒有
                // 任何回饋；在滿版格線佈局下所有格子彼此緊貼，等於永遠拉不大。
                // 讓位改由上層的 resolvePushResize 解算，這裡只負責跟手與夾住畫布邊界。
                setSize({ width: newWidth, height: newHeight });
                setPosition({ x: newX, y: newY });
                onResizePreview?.(newX, newY, newWidth, newHeight);
            });
        };

        const handlePointerUp = (e: React.PointerEvent) => {
            if (!resizeState.current.isResizing) return;

            e.preventDefault();

            (e.target as HTMLElement).releasePointerCapture(e.pointerId);

            resizeState.current.isResizing = false;
            setIsResizing(false);

            onResizeEnd(position.x, position.y, size.width, size.height);

            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };

        return {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp
        };
    }, [cellWidth, cellHeight, currentX, currentY, currentWidth, currentHeight, minGridW, minGridH, onResizePreview, onResizeEnd, position, size]);

    // Update size and position when props change
    // CRITICAL: Use useEffect to avoid setState during render phase (causes infinite re-render)
    // Also use functional update to compare against current state
    useEffect(() => {
        if (!isResizing) {
            setSize(prev => {
                if (prev.width !== currentWidth || prev.height !== currentHeight) {
                    return { width: currentWidth, height: currentHeight };
                }
                return prev;
            });
            setPosition(prev => {
                if (prev.x !== currentX || prev.y !== currentY) {
                    return { x: currentX, y: currentY };
                }
                return prev;
            });
        }
    }, [currentWidth, currentHeight, currentX, currentY, isResizing]);

    return {
        size,
        position,
        isResizing,
        cornerHandlers: {
            nw: createCornerHandlers('nw'),
            ne: createCornerHandlers('ne'),
            sw: createCornerHandlers('sw'),
            se: createCornerHandlers('se')
        }
    };
}
