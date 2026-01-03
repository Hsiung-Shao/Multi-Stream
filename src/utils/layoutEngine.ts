import { CanvasItem } from '../types/canvas';

/**
 * Checks if a specific grid area is occupied by any item.
 */
function isOccupied(
    items: CanvasItem[],
    x: number,
    y: number,
    w: number,
    h: number
): boolean {
    return items.some(item => {
        return (
            x < item.layout.x + item.layout.w &&
            x + w > item.layout.x &&
            y < item.layout.y + item.layout.h &&
            y + h > item.layout.y
        );
    });
}

/**
 * Finds the first available position for a new item of given size.
 * Scans top-to-bottom, left-to-right.
 */
export function findAvailablePosition(
    items: CanvasItem[],
    w: number,
    h: number,
    cols: number = 24
): { x: number; y: number } {
    let y = 0;

    // Safety break to prevent infinite loops (though highly unlikely with this logic)
    const MAX_Y = 1000;

    while (y < MAX_Y) {
        for (let x = 0; x <= cols - w; x++) {
            if (!isOccupied(items, x, y, w, h)) {
                return { x, y };
            }
        }
        y++;
    }

    return { x: 0, y: Number.MAX_VALUE }; // Fallback to bottom
}

/**
 * Calculates layout for a "Stream + Chat" combo (20x24 + 4x24).
 * Ensures they are placed on the same row if possible.
 */
export function getSmartLayoutForStreamAndChat(
    items: CanvasItem[],
    cols: number = 24
): { stream: { x: number, y: number, w: number, h: number }, chat: { x: number, y: number, w: number, h: number } } {
    const STREAM_W = 20;
    const CHAT_W = 4;
    const H = 24; // Full row height relative to screen height logic (16:9 aspect)

    // Option 1: Try to fit both on a new empty row (simplest and cleanest)
    // We scan for a Y where the WHOLE row (0-24) is free, or at least 0-24 is free.

    // Actually, simply using findAvailablePosition for the 24-width block (combined) is easier.
    // Treat them as a 24x24 block first.
    const pos = findAvailablePosition(items, STREAM_W + CHAT_W, H, cols);

    return {
        stream: { x: pos.x, y: pos.y, w: STREAM_W, h: H },
        chat: { x: pos.x + STREAM_W, y: pos.y, w: CHAT_W, h: H }
    };
}
