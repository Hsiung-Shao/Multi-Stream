/**
 * AABB Collision Detection for SimpleCanvas
 * Prevents windows from overlapping
 */

import { PixelPosition } from './gridConfig';

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Check if two rectangles overlap (AABB collision)
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

/**
 * Check if a rectangle collides with any other rectangles
 * Returns the ID of the first colliding window, or null if no collision
 */
export function checkCollision(
    targetId: string,
    targetRect: Rect,
    allWindows: Array<{ id: string; position: PixelPosition }>
): string | null {
    for (const window of allWindows) {
        if (window.id === targetId) continue;

        const windowRect: Rect = {
            x: window.position.x,
            y: window.position.y,
            width: window.position.width,
            height: window.position.height
        };

        if (rectsOverlap(targetRect, windowRect)) {
            return window.id;
        }
    }
    return null;
}

/**
 * Find the nearest valid position that doesn't collide
 * Returns the original position if valid, or adjusted position if collision
 */
export function findValidPosition(
    targetId: string,
    desiredRect: Rect,
    originalRect: Rect,
    allWindows: Array<{ id: string; position: PixelPosition }>
): Rect {
    // If no collision, return desired position
    if (!checkCollision(targetId, desiredRect, allWindows)) {
        return desiredRect;
    }

    // Return original position if collision detected
    // This prevents the window from moving to an invalid position
    return originalRect;
}

/**
 * Check if resize would cause collision
 */
export function checkResizeCollision(
    targetId: string,
    newSize: { width: number; height: number },
    currentPosition: { x: number; y: number },
    allWindows: Array<{ id: string; position: PixelPosition }>
): boolean {
    const newRect: Rect = {
        x: currentPosition.x,
        y: currentPosition.y,
        width: newSize.width,
        height: newSize.height
    };

    return checkCollision(targetId, newRect, allWindows) !== null;
}
