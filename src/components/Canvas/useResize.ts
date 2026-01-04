/**
 * useResize hook - High performance resize handling from all 4 corners
 * Uses Pointer Events + requestAnimationFrame for smooth resizing
 */

import { useCallback, useRef, useState } from 'react';
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
    checkCollision?: (x: number, y: number, width: number, height: number) => boolean;
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
        checkCollision
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

                // Check collision if provided
                if (checkCollision && checkCollision(newX, newY, newWidth, newHeight)) {
                    return;
                }

                setSize({ width: newWidth, height: newHeight });
                setPosition({ x: newX, y: newY });
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
    }, [cellWidth, cellHeight, currentX, currentY, currentWidth, currentHeight, minGridW, minGridH, checkCollision, onResizeEnd, position, size]);

    // Update size and position when props change
    if (!isResizing) {
        if (size.width !== currentWidth || size.height !== currentHeight) {
            setSize({ width: currentWidth, height: currentHeight });
        }
        if (position.x !== currentX || position.y !== currentY) {
            setPosition({ x: currentX, y: currentY });
        }
    }

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
