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

    // Safety break only for extreme cases, but effectively infinite for our usage
    // We want to find ANY free spot, Y can grow.
    // 24x24 grid initial, but we can go beyond row 24.
    const MAX_Y = 10000;

    // Scan column by column, then row by row?
    // Standard reading order: Top-to-bottom, Left-to-right.
    // loops: y then x.
    while (y < MAX_Y) {
        for (let x = 0; x <= cols - w; x++) {
            if (!isOccupied(items, x, y, w, h)) {
                return { x, y };
            }
        }
        y++;
    }

    return { x: 0, y: Math.max(0, ...items.map(i => i.layout.y + i.layout.h)) }; // Fallback to absolute bottom
}

/**
 * Calculates the required number of rows to fit all items, 
 * expanding in increments of 12 rows (dynamic).
 * Minimum 24 rows.
 */
export function calculateRequiredRows(items: CanvasItem[]): number {
    if (items.length === 0) return 24;

    const maxY = items.reduce((max, item) => Math.max(max, item.layout.y + item.layout.h), 0);

    // If empty or fits in 24, return 24.
    if (maxY <= 24) return 24;

    // Expand by 12s
    // base 24.
    // If maxY is 25, we need 24 + 12 = 36? Or just cover it?
    // "Auto-extend by 24x12 block".
    // So logic: Math.ceil((maxY - 24) / 12) * 12 + 24 ?
    // Simpler: Math.ceil(maxY / 12) * 12.
    // If maxY is 25 -> 36. 
    // If maxY is 13 -> 24.
    // If maxY is 24 -> 24.

    // Ensure minimum 24
    if (items.length <= 16) return 24; // Force fixed height for Auto-Grid mode

    let rows = Math.ceil(maxY / 12) * 12;
    return Math.max(24, rows);
}

/**
 * Calculates layout for a "Stream + Chat" combo (20x24 + 4x24).
 * Ensures they are placed on the same row if possible.
 */
export function getSmartLayoutForStreamAndChat(
    items: CanvasItem[],
    cols: number = 24
): { stream: { x: number, y: number, w: number, h: number }, chat: { x: number, y: number, w: number, h: number } } {
    // Keep existing getSmartLayoutForStreamAndChat for reference or potential future use
    const streamW = 20;
    const chatW = 4;
    const h = 24;
    const pos = findAvailablePosition(items, streamW + chatW, h, cols);

    return {
        stream: { x: pos.x, y: pos.y, w: streamW, h: h },
        chat: { x: pos.x + streamW, y: pos.y, w: chatW, h: h }
    };
}

/**
 * Repacks items in rows and maximizes stream windows to fill available width.
 * Used for "Auto-Grid" refinement.
 */
export function repackAndMaximizeRows(items: CanvasItem[], cols: number = 24): CanvasItem[] {
    // 1. Group by Row (using y)
    // We assume items are somewhat aligned to rows by the grid calculator.
    // Use a Map<y, items[]>
    const rows = new Map<number, CanvasItem[]>();

    items.forEach(item => {
        const y = item.layout.y;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y)!.push(item);
    });

    let newItems: CanvasItem[] = [];

    // 2. Process each row
    for (const rowItems of rows.values()) {
        // Sort by Type (Stream < Chat) then X
        rowItems.sort((a, b) => {
            const typeScore = (type: string) => type === 'stream' ? 0 : 1;
            const scoreA = typeScore(a.type);
            const scoreB = typeScore(b.type);
            if (scoreA !== scoreB) return scoreA - scoreB;
            return a.layout.x - b.layout.x;
        });

        // First pass: Apply explicit constraints (Chat shrinking)
        // And calculate guaranteed used width
        let currentUsedWidth = 0;
        let expandableItems: CanvasItem[] = [];

        rowItems.forEach(item => {
            if (item.type === 'chat') {
                // Constraint: Max 4
                if (item.layout.w > 4) {
                    item.layout.w = 4;
                }
                // Constraint: Min Height 6? Height is row-based usually, handled by grid spec.
                if (item.layout.h < 6) item.layout.h = 6;
            } else if (item.type === 'stream') {
                if (item.layout.h < 6) item.layout.h = 6;
                if (item.layout.w < 6) item.layout.w = 6;
                expandableItems.push(item);
            }
            currentUsedWidth += item.layout.w;
        });

        // Calculate Deficit
        const totalWidth = cols;
        let remaining = totalWidth - currentUsedWidth;

        // Distribute remaining to expandable items (Streams)
        if (remaining > 0 && expandableItems.length > 0) {
            // Distribute as evenly as possible using remainder
            const perItem = Math.floor(remaining / expandableItems.length);
            let remainder = remaining % expandableItems.length;

            expandableItems.forEach(item => {
                const add = perItem + (remainder > 0 ? 1 : 0);
                item.layout.w += add;
                if (remainder > 0) remainder--;
            });
        }

        // 3. Re-stack X positions
        let currentX = 0;
        const packedRow = rowItems.map(item => {
            const newItem = {
                ...item,
                layout: {
                    ...item.layout,
                    x: currentX
                }
            };
            currentX += newItem.layout.w;
            return newItem;
        });

        newItems = [...newItems, ...packedRow];
    }

    return newItems;
}

/**
 * Finds the maximal empty rectangular space for a new item.
 * Searches for gaps >= minW x minH.
 * 
 * Strategy:
 * 1. Define search bounds (visible area + some buffer).
 * 2. Scan for top-left corners of potential spaces.
 * 3. Expands to find max width and height.
 * 4. Selects the largest area.
 * 5. If no internal gap found, returns default size at the bottom.
 */
export function findMaximalEmptyRect(
    items: CanvasItem[],
    cols: number = 24,
    minW: number = 6,
    minH: number = 6
): { x: number, y: number, w: number, h: number } {
    // 1. Determine scan range
    // We scan up to the bottom of the lowest item + some buffer to check for "holes"
    const contentBottom = Math.max(0, ...items.map(i => i.layout.y + i.layout.h));
    const SCAN_Y_LIMIT = Math.max(24, contentBottom);

    let bestRect = { x: 0, y: contentBottom, w: minW, h: minH };
    let maxArea = 0;
    let foundHole = false;

    // 2. Iterate through grid points
    // Optimization: Only check x,y that are either 0,0 or adjacent to existing items/boundaries?
    // For 24 cols, brute force is acceptable.
    for (let y = 0; y < SCAN_Y_LIMIT; y++) {
        for (let x = 0; x <= cols - minW; x++) {

            // Fast check: is top-left occupied?
            if (isOccupied(items, x, y, 1, 1)) continue;

            // 3. Expand Width
            let maxW = 0;
            for (let w = 1; w <= cols - x; w++) {
                if (!isOccupied(items, x, y, w, 1)) {
                    maxW = w;
                } else {
                    break;
                }
            }

            if (maxW < minW) continue;

            // 4. Expand Height
            // We know we have at least maxW width at this row.
            // Check how far down we can go with AT LEAST minW width?
            // Or rather, we want the LARGEST rect starting at x,y.
            // It might be Wide and Short, or Narrow and Tall.

            // Simplified Maximal Rect approach at (x,y):
            // We just found maxW available at row y.
            // We can check expanding height for width = maxW... down to minW.

            // Let's iterate various widths from maxW down to minW
            // In practice, usually we want to fill usage width first?
            // The requirement is "Maximal Space".

            // To keep it performant: just check expanding height for the FULL maxW found.
            // AND check expanding height for minW width. (Covering the two extremes)

            const checkRects = [maxW, minW]; // Check exact max width found, and the minimum required width.

            for (const tryW of checkRects) {
                if (tryW < minW) continue;

                let maxH = 0;
                // Limit height scan to reasonable bounds
                for (let h = 1; h <= SCAN_Y_LIMIT - y + 24; h++) { // Allow looking a bit beyond current bottom
                    if (!isOccupied(items, x, y, tryW, h)) {
                        maxH = h;
                    } else {
                        break;
                    }
                }

                if (maxH >= minH) {
                    const area = tryW * maxH;

                    // Preference: Pick larger area. 
                    // Tie-break: Top-most (min y), then Left-most (min x) -> implicit in loop order
                    if (area > maxArea) {
                        maxArea = area;
                        bestRect = { x, y, w: tryW, h: maxH };
                        foundHole = true;
                    }
                }
            }
        }
        // Optimization: If we found a hole in this row, should we stop? 
        // No, might find a bigger one later. But typically we want "First available BIG hole" or "Biggest hole"?
        // Usually "Top-most large hole" is preferred for "filling gaps".
        // If we found a hole at y=0, do we care about a slightly bigger one at y=100?
        // Probably not. But let's scan fully for "Maximal".
        // Actually, for UX, filling top gaps is priority. Maximum AREA is secondary if the gap is way down.
        // Let's stick to "Maximal Area" within the current content bounds.
    }

    // If we simply return the default bottom rect, ensure it uses the calculated bestRect if a hole was found.
    // However, if NO hole found (foundHole is false), we return the default appending to bottom.
    // The default append should ideally be just minW/minH or whatever default size logic?
    // The caller might override the W/H if it's just appending. 
    // But here we return {x, y, w, h}.

    if (!foundHole) {
        // Find standard position at bottom
        const pos = findAvailablePosition(items, minW, minH, cols);
        return { x: pos.x, y: pos.y, w: minW, h: minH };
    }

    return bestRect;
}
