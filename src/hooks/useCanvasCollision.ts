import { useCallback } from 'react';
import { CanvasItem } from '../types/canvas';

interface Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface UseCanvasCollisionProps {
    items: CanvasItem[];
    currentItemId: string;
    snapThreshold?: number;
}

export function useCanvasCollision({ items, currentItemId, snapThreshold = 20 }: UseCanvasCollisionProps) {

    const getSnappedPosition = useCallback((x: number, y: number, w: number, h: number) => {
        let newX = x;
        let newY = y;

        // Filter out current item
        const otherItems = items.filter(item => item.i !== currentItemId);

        // Check collisions/snapping with other items
        for (const item of otherItems) {
            const target = item.layout;

            // X Axis Snapping
            // Left to Right (Current Left snaps to Target Right)
            if (Math.abs(x - (target.x + target.w)) < snapThreshold) {
                newX = target.x + target.w;
            }
            // Right to Left (Current Right snaps to Target Left)
            if (Math.abs((x + w) - target.x) < snapThreshold) {
                newX = target.x - w;
            }
            // Left to Left (Align Left)
            if (Math.abs(x - target.x) < snapThreshold) {
                newX = target.x;
            }
            // Right to Right (Align Right)
            if (Math.abs((x + w) - (target.x + target.w)) < snapThreshold) {
                newX = target.x + target.w - w;
            }

            // Y Axis Snapping
            // Top to Bottom (Current Top snaps to Target Bottom)
            if (Math.abs(y - (target.y + target.h)) < snapThreshold) {
                newY = target.y + target.h;
            }
            // Bottom to Top (Current Bottom snaps to Target Top)
            if (Math.abs((y + h) - target.y) < snapThreshold) {
                newY = target.y - h;
            }
            // Top to Top (Align Top)
            if (Math.abs(y - target.y) < snapThreshold) {
                newY = target.y;
            }
            // Bottom to Bottom (Align Bottom)
            if (Math.abs((y + h) - (target.y + target.h)) < snapThreshold) {
                newY = target.y + target.h - h;
            }
        }

        // Container Boundary Snapping (Optional, assumed container starts at 0,0)
        if (Math.abs(newX) < snapThreshold) newX = 0;
        if (Math.abs(newY) < snapThreshold) newY = 0;

        return { x: newX, y: newY };
    }, [items, currentItemId, snapThreshold]);

    return { getSnappedPosition };
}
