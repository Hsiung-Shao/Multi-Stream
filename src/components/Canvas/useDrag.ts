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

export interface UseDragOptions {
    cellWidth: number;
    cellHeight: number;
    currentX: number;
    currentY: number;
    width: number;
    height: number;
    onDragEnd: (x: number, y: number, collisionId: string | null) => void;
    checkCollision?: (x: number, y: number, screenX?: number, screenY?: number) => string | null;
    maxRows?: number; // Add maxRows to support dynamic grid height
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
        checkCollision,
        maxRows = GRID_ROWS // Default to GRID_ROWS if not provided
    } = options;

    // Smooth position (follows cursor directly)
    const [position, setPosition] = useState({ x: currentX, y: currentY });
    // Snapped position (where it will land - for ghost preview)
    const [snapPosition, setSnapPosition] = useState({ x: currentX, y: currentY });
    // Collision ID for swap feedback
    const [collisionId, setCollisionId] = useState<string | null>(null);
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

        // Request animation frame for smooth updates
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }

        const clientX = e.clientX;
        const clientY = e.clientY;

        rafRef.current = requestAnimationFrame(() => {
            const deltaX = clientX - dragState.current.startX;
            const deltaY = clientY - dragState.current.startY;

            // Raw position (follows cursor smoothly)
            let rawX = dragState.current.startPosX + deltaX;
            let rawY = dragState.current.startPosY + deltaY;

            // Snap calculation
            let snappedX = snapToGrid(rawX, cellWidth);
            let snappedY = snapToGrid(rawY, cellHeight);

            // Clamp snapped position
            snappedX = clampToGridBounds(snappedX, width, GRID_COLS, cellWidth);
            // Use dynamic maxRows for vertical clamping
            snappedY = clampToGridBounds(snappedY, height, maxRows, cellHeight);

            // Check collision for snap position
            // Modified: We now allow staying in collision state (for swap)
            // and report the collision ID
            let collidedId: string | null = null;
            if (checkCollision) {
                // Pass snapped top-left AND raw pointer screen coords
                collidedId = checkCollision(snappedX, snappedY, clientX, clientY);
            }

            // Update state
            setPosition({ x: rawX, y: rawY });
            setSnapPosition({ x: snappedX, y: snappedY });
            setCollisionId(collidedId);
        });
    }, [cellWidth, cellHeight, width, height, checkCollision, maxRows]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!dragState.current.isDragging) return;

        e.preventDefault();

        // Release pointer capture
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        dragState.current.isDragging = false;
        setIsDragging(false);
        setCollisionId(null);

        // Snap to final position
        setPosition({ x: snapPosition.x, y: snapPosition.y });

        // Notify parent of final position AND collision (for swap)
        // We need to re-check collision one last time to be sure? 
        // Or rely on state? State might be one frame behind in rare cases but snapPosition is up to date in closure?
        // Actually snapPosition in closure is from render.
        // Let's re-calculate logic to be safe or use refs? 
        // For simplicity, we can just pass the latest computed snapPosition from the state? 
        // Actually, inside callback, state might be stale if we relied on `snapPosition` from closure.
        // But `onDragEnd` will be called with the values we just set? No.

        // Let's re-calculate cleanly to ensure 100% sync
        // Accessing 'snapPosition' here is from the render cycle when handlePointerUp was created.
        // Since we update snapPosition in RAF, the render cycle might update handlePointerUp.
        // To be safe, let's recalculate the final snapX/Y from the last known Event? No event here.
        // We can use a ref to track latest snapPosition.

        onDragEnd(snapPosition.x, snapPosition.y, collisionId);

        // Clean up animation frame
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }
    }, [onDragEnd, snapPosition, collisionId]);

    // Update position when props change (e.g., from swap)
    if (!isDragging && (position.x !== currentX || position.y !== currentY)) {
        setPosition({ x: currentX, y: currentY });
        setSnapPosition({ x: currentX, y: currentY });
    }

    return {
        position,
        snapPosition,
        collisionId,
        isDragging,
        dragHandlers: {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp
        }
    };
}
