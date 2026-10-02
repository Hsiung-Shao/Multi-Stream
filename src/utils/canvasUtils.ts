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
