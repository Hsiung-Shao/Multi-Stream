import { CanvasItem, CanvasItemLayout } from '../types/canvas';

/**
 * Finds a free position for a rectangle of size w x h,
 * attempting to minimize gap (0px) and avoid overlap.
 */
// Helper to snap value to grid
function snap(val: number, size: number): number {
    return Math.round(val / size) * size;
}

export function snapToGrid(
    layout: { x: number; y: number; w: number; h: number },
    gridSize: { w: number; h: number }
): { x: number; y: number; w: number; h: number } {
    return {
        x: snap(layout.x, gridSize.w),
        y: snap(layout.y, gridSize.h),
        w: Math.max(gridSize.w, snap(layout.w, gridSize.w)),
        h: Math.max(gridSize.h, snap(layout.h, gridSize.h))
    };
}

export function findFreePosition(
    width: number,
    height: number,
    items: CanvasItem[],
    containerWidth: number = 1920,
    stepX: number = 10,
    stepY: number = 10
): { x: number, y: number } {

    // Potential candidates: (0,0) and points next to existing corners
    const candidates: { x: number, y: number }[] = [{ x: 0, y: 0 }];

    items.forEach(item => {
        // Right of item
        candidates.push({ x: item.layout.x + item.layout.w, y: item.layout.y });
        // Bottom of item
        candidates.push({ x: item.layout.x, y: item.layout.y + item.layout.h });

        // Also aligned with 0 x?
        candidates.push({ x: 0, y: item.layout.y + item.layout.h });
    });

    // Sort candidates: Top-Left preference (sort by y then x)
    candidates.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 5) return a.x - b.x;
        return a.y - b.y;
    });

    // Filter valid candidates
    for (const pos of candidates) {
        const rect = { x: pos.x, y: pos.y, w: width, h: height };

        // Check overlap
        const hasOverlap = items.some(item => rectIntersect(rect, item.layout));
        if (!hasOverlap) {
            return { x: pos.x, y: pos.y };
        }
    }

    // Fallback if no smart slot found
    const maxY = items.reduce((max, item) => Math.max(max, item.layout.y + item.layout.h), 0);
    return { x: 0, y: maxY > 0 ? maxY : 0 };
}

function rectIntersect(r1: CanvasItemLayout, r2: CanvasItemLayout): boolean {
    return !(r2.x >= r1.x + r1.w ||
        r2.x + r2.w <= r1.x ||
        r2.y >= r1.y + r1.h ||
        r2.y + r2.h <= r1.y);
}

/**
 * Generates a layout configuration for the current items based on a standard type (Grid, Focus).
 * Scales to fit the container if dimensions are provided.
 */
export function generateStandardLayout(
    items: CanvasItem[],
    type: 'grid' | 'focus' | 'flow', // Added 'flow'
    streamCount: number,
    screenWidth: number = 1600,
    screenHeight: number = 900
): CanvasItem[] {
    const newItems = [...items];

    // Sort items by visual order to keep relative positions
    newItems.sort((a, b) => {
        if (Math.abs(a.layout.y - b.layout.y) < 50) return a.layout.x - b.layout.x;
        return a.layout.y - b.layout.y;
    });

    const count = newItems.length;
    if (count === 0) return newItems;

    // Grid Logic
    if (type === 'grid') {
        let colCount = Math.ceil(Math.sqrt(count));
        let rowCount = Math.ceil(count / colCount);

        // Calculate tile size to fit container
        // If container is infinite (0), fallback to default
        const useAutoResize = screenWidth > 0 && screenHeight > 0;
        const baseW = useAutoResize ? Math.floor(screenWidth / colCount) : 480;
        const baseH = useAutoResize ? Math.floor(screenHeight / rowCount) : 270;

        newItems.forEach((item, index) => {
            const row = Math.floor(index / colCount);
            const col = index % colCount;
            // 0px gap
            item.layout = {
                x: col * baseW,
                y: row * baseH,
                w: baseW,
                h: baseH
            };
        });
    } else if (type === 'focus') {
        // For Focus, first item gets big area, others stack on side
        // Layout: 
        // | Main (2/3) | Side (1/3) |
        // |            | Side ...   |

        // Calculate tile size
        const useAutoResize = screenWidth > 0 && screenHeight > 0;
        const baseW = 480;
        const baseH = 270;

        newItems.forEach((item, index) => {
            if (index === 0) {
                const mainW = useAutoResize ? Math.floor(screenWidth * 0.66) : baseW * 2;
                const mainH = useAutoResize ? screenHeight : baseH * 2;
                item.layout = { x: 0, y: 0, w: mainW, h: mainH };
            } else {
                const mainW = useAutoResize ? Math.floor(screenWidth * 0.66) : baseW * 2;
                const sideW = useAutoResize ? (screenWidth - mainW) : baseW;
                const sideCount = count - 1;
                const sideH = useAutoResize ? Math.floor(screenHeight / sideCount) : baseH;

                const sideIndex = index - 1;
                item.layout = {
                    x: mainW,
                    y: sideIndex * sideH,
                    w: sideW,
                    h: sideH
                };
            }
        });
    } else if (type === 'flow') {
        const CHAT_W = 280; // New smaller width
        const PADDING = 60;
        const availableW = screenWidth > 0 ? screenWidth : 1600;

        let currentY = 0;

        for (let i = 0; i < newItems.length; i++) {
            const item = newItems[i];
            const nextItem = newItems[i + 1];

            // Default: Full width minus padding
            let w = Math.max(320, availableW - PADDING);
            let h = Math.floor((w * 9) / 16);

            // Grouping Logic: Stream + Chat
            const isStream = item.type === 'stream';
            const isNextChat = nextItem && nextItem.type === 'chat';

            if (isStream && isNextChat) {
                // Pair found!
                // Stream takes remaining space
                w = Math.max(320, availableW - CHAT_W - PADDING);
                h = Math.floor((w * 9) / 16);

                // Set Stream
                item.layout = { x: 0, y: currentY, w, h };

                // Set Chat (Next Item)
                const chatH = h;
                const chatX = w; // Right after stream
                nextItem.layout = { x: chatX, y: currentY, w: CHAT_W, h: chatH };

                // Skip next item in loop
                i++;
            } else {
                // Single Item (Stream or Chat without pair)
                // If it's a lone chat, maybe keep it small? 
                if (item.type === 'chat') {
                    w = CHAT_W;
                    // Keep height consistent or default? 
                    // Let's use standard height derived from a theoretical stream
                    const theoreticalStreamW = Math.max(320, availableW - CHAT_W - PADDING);
                    h = Math.floor((theoreticalStreamW * 9) / 16);
                }

                item.layout = { x: 0, y: currentY, w, h };
            }

            // Move Y down
            currentY += h; // 0px gap vertically
        }
    }

    return newItems;
}

/**
 * Resolves collisions by SWAPPING positions if significant overlap occurs.
 * If A is dropped onto B, A takes B's position, and B takes A's old position.
 */
export function resolveCollision(
    movedItem: CanvasItem,
    allItems: CanvasItem[],
    oldLayout?: CanvasItemLayout
): CanvasItem[] {
    // If no oldLayout provided, we can't swap to "previous" spot. 
    // Just return items as is (free movement).
    if (!oldLayout) return allItems;

    const newItems = [...allItems];
    // Find the item in newItems that matches movedItem (it has the NEW layout already)
    const movedIndex = newItems.findIndex(i => i.i === movedItem.i);
    if (movedIndex === -1) return allItems;

    // We only care about collision with OTHER items
    // Find candidate for swap: The one with largest intersection area
    let maxOverlapArea = 0;
    let swapCandidateIndex = -1;

    // movedItem is already updated in newItems, so we use that.
    const currentRect = newItems[movedIndex].layout;

    newItems.forEach((other, index) => {
        if (index === movedIndex) return;

        if (rectIntersect(currentRect, other.layout)) {
            const intersection = getIntersectionArea(currentRect, other.layout);
            if (intersection > maxOverlapArea) {
                maxOverlapArea = intersection;
                swapCandidateIndex = index;
            }
        }
    });

    // Threshold: overlap must be significant? Or just non-zero? 
    // "Swap" implies user intent. Let's say > 30% of the smaller item's area?
    // Or just simple center checking.
    // Let's use > 0 for now, but sort by area implies "most overlapped".

    if (swapCandidateIndex !== -1) {
        const candidate = newItems[swapCandidateIndex];

        // Exact Swap
        // 1. Candidate takes Old Layout
        // 2. Moved Item takes Candidate's Old Layout (which is its current layout in the array essentially, but we want exact snap?)

        // If we want exact snap to the slot B was in:
        // movedItem.layout = candidate.layout
        // candidate.layout = oldLayout

        // But wait, movedItem in `newItems` already has "dragged position".
        // If we want to snap it to the candidate's slot:
        const candidateOriginalLayout = { ...candidate.layout };

        newItems[movedIndex] = {
            ...newItems[movedIndex],
            layout: candidateOriginalLayout
        };

        newItems[swapCandidateIndex] = {
            ...candidate,
            layout: { ...oldLayout }
        };
    }

    return newItems;
}

function getIntersectionArea(r1: CanvasItemLayout, r2: CanvasItemLayout): number {
    const xOverlap = Math.max(0, Math.min(r1.x + r1.w, r2.x + r2.w) - Math.max(r1.x, r2.x));
    const yOverlap = Math.max(0, Math.min(r1.y + r1.h, r2.y + r2.h) - Math.max(r1.y, r2.y));
    return xOverlap * yOverlap;
}
