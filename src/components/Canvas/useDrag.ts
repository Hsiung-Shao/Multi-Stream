/**
 * useDrag hook - High performance drag handling
 * Smooth dragging with ghost preview at snap position
 */

import { useCallback, useRef, useState } from 'react';
import { snapToGrid, clampToGridBounds, GRID_COLS, GRID_ROWS } from './gridConfig';

interface DragState {
    isDragging: boolean;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
}

interface UseDragOptions {
    cellWidth: number;
    cellHeight: number;
    currentX: number;
    currentY: number;
    width: number;
    height: number;
    onDragEnd: (x: number, y: number) => void;
    checkCollision?: (x: number, y: number) => boolean;
}

export function useDrag(options: UseDragOptions) {
    const {
        cellWidth,
        cellHeight,
        currentX,
        currentY,
        width,
        height,
        onDragEnd,
        checkCollision
    } = options;

    // Smooth position (follows cursor directly)
    const [position, setPosition] = useState({ x: currentX, y: currentY });
    // Snapped position (where it will land - for ghost preview)
    const [snapPosition, setSnapPosition] = useState({ x: currentX, y: currentY });
    const [isDragging, setIsDragging] = useState(false);

    const dragState = useRef<DragState>({
        isDragging: false,
        startX: 0,
        startY: 0,
        startPosX: 0,
        startPosY: 0
    });
    const rafRef = useRef<number | undefined>(undefined);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Capture pointer for smooth tracking
        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        dragState.current = {
            isDragging: true,
            startX: e.clientX,
            startY: e.clientY,
            startPosX: currentX,
            startPosY: currentY
        };

        setIsDragging(true);
    }, [currentX, currentY]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState.current.isDragging) return;

        e.preventDefault();

        // Cancel any pending animation frame
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }

        // Use requestAnimationFrame for smooth updates
        rafRef.current = requestAnimationFrame(() => {
            const deltaX = e.clientX - dragState.current.startX;
            const deltaY = e.clientY - dragState.current.startY;

            // Raw position (follows cursor smoothly)
            let rawX = dragState.current.startPosX + deltaX;
            let rawY = dragState.current.startPosY + deltaY;

            // Clamp raw position to bounds
            rawX = Math.max(0, Math.min(rawX, (GRID_COLS * cellWidth) - width));
            rawY = Math.max(0, Math.min(rawY, (GRID_ROWS * cellHeight) - height));

            // Snapped position (where it will land)
            let snappedX = snapToGrid(rawX, cellWidth);
            let snappedY = snapToGrid(rawY, cellHeight);

            // Clamp snapped position
            snappedX = clampToGridBounds(snappedX, width, GRID_COLS, cellWidth);
            snappedY = clampToGridBounds(snappedY, height, GRID_ROWS, cellHeight);

            // Check collision for snap position
            if (checkCollision && checkCollision(snappedX, snappedY)) {
                // Keep last valid snap position, but still update smooth position
                setPosition({ x: rawX, y: rawY });
                return;
            }

            // Update both positions
            setPosition({ x: rawX, y: rawY });
            setSnapPosition({ x: snappedX, y: snappedY });
        });
    }, [cellWidth, cellHeight, width, height, checkCollision]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!dragState.current.isDragging) return;

        e.preventDefault();

        // Release pointer capture
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        dragState.current.isDragging = false;
        setIsDragging(false);

        // Snap to final position
        setPosition({ x: snapPosition.x, y: snapPosition.y });

        // Notify parent of final position
        onDragEnd(snapPosition.x, snapPosition.y);

        // Clean up animation frame
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }
    }, [onDragEnd, snapPosition]);

    // Update position when props change (e.g., from swap)
    if (!isDragging && (position.x !== currentX || position.y !== currentY)) {
        setPosition({ x: currentX, y: currentY });
        setSnapPosition({ x: currentX, y: currentY });
    }

    return {
        position,
        snapPosition,
        isDragging,
        dragHandlers: {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp
        }
    };
}
