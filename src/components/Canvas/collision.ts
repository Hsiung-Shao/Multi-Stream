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
 * Check if a point is inside a rectangle
 */
export function isPointInRect(point: { x: number; y: number }, rect: Rect): boolean {
    return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
    );
}

/**
 * Check if a point collides with any other rectangles
 * Returns the ID of the first colliding window, or null if no collision
 */
export function checkPointCollision(
    targetId: string,
    x: number,
    y: number,
    allWindows: Array<{ id: string; position: PixelPosition }>
): string | null {
    const point = { x, y };
    for (const window of allWindows) {
        if (window.id === targetId) continue;

        const windowRect: Rect = {
            x: window.position.x,
            y: window.position.y,
            width: window.position.width,
            height: window.position.height
        };

        if (isPointInRect(point, windowRect)) {
            return window.id;
        }
    }
    return null;
}
