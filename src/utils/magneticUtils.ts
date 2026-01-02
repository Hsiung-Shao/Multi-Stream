import { CanvasItem, CanvasItemLayout } from '../types/canvas';

// Threshold for defining "adjacency" (in pixels)
const ADJACENCY_THRESHOLD = 10;

type ResizeHandleAxis = 'n' | 's' | 'e' | 'w';

/**
 * Checks if two intervals overlap (e.g., vertical overlap for horizontal adjacency)
 */
function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
    return aStart < bEnd && aEnd > bStart;
}

/**
 * Finds items that are adjacent to the reference item in the specified direction.
 * 
 * @param item The active item being resized
 * @param allItems All canvas items
 * @param axis The direction of resizing ('e' = right edge moving, so find items to the right)
 */
export function findAdjacentItems(
    item: CanvasItem,
    allItems: CanvasItem[],
    axis: ResizeHandleAxis
): CanvasItem[] {
    const layout = item.layout;
    const neighbors: CanvasItem[] = [];

    allItems.forEach(other => {
        if (other.i === item.i) return;

        const otherLayout = other.layout;

        if (axis === 'e') {
            // Find items to the RIGHT of current item
            // Condition 1: other.x is close to item.x + item.w
            const dist = Math.abs(otherLayout.x - (layout.x + layout.w));
            // Condition 2: Vertical overlap exists
            const vOverlap = intervalsOverlap(layout.y, layout.y + layout.h, otherLayout.y, otherLayout.y + otherLayout.h);

            if (dist <= ADJACENCY_THRESHOLD && vOverlap) {
                neighbors.push(other);
            }
        } else if (axis === 's') {
            // Find items BELOW current item
            // Condition 1: other.y is close to item.y + item.h
            const dist = Math.abs(otherLayout.y - (layout.y + layout.h));
            // Condition 2: Horizontal overlap exists
            const hOverlap = intervalsOverlap(layout.x, layout.x + layout.w, otherLayout.x, otherLayout.x + otherLayout.w);

            if (dist <= ADJACENCY_THRESHOLD && hOverlap) {
                neighbors.push(other);
            }
        }
        // Note: 'n' (top) and 'w' (left) support can be added if we support top/left resizing interactions.
        // Currently react-resizable standard handles are usually se (bottom-right).
        // If we only support 'se' handle, we focus on 'e' and 's' neighbors.
    });

    return neighbors;
}

/**
 * Calculates new layouts for neighbors based on the resize delta of the active item.
 * 
 * @param activeItem The item being resized
 * @param neighbors The adjacent items found
 * @param axis The axis of change ('w' for width change, 'h' for height change)
 * @param delta The change in size (positive = grew, negative = shrank)
 */
export function calculateMagneticResize(
    _activeItem: CanvasItem,
    neighbors: CanvasItem[],
    axis: 'w' | 'h',
    delta: number
): { itemId: string, layout: CanvasItemLayout }[] {
    const updates: { itemId: string, layout: CanvasItemLayout }[] = [];

    neighbors.forEach(neighbor => {
        const newLayout = { ...neighbor.layout };

        if (axis === 'w') {
            // Horizontal Resize (East Handle)
            // If active item width changed by delta:
            // Neighbor to the right should move X by delta and decrease Width by delta (to stay in place relative to far right)?
            // OR just move X?
            // "Magnetic Resizing" usually means maintaining the gap.
            // If I grow right (delta > 0), neighbor push right? Or shrink?
            // User request: "Auto set based on window size" -> Implies filling gaps or shared borders.
            // Most intuitive: "Shared Edge".
            // If I move my right edge by +10px, the neighbor's left edge moves by +10px.
            // This means Neighbor.x += delta, Neighbor.w -= delta (if we want to keep neighbor right edge fixed).
            // OR Neighbor.x += delta (push).

            // Let's implement "Push/Pull" for position first, but what about size?
            // If we just push, we might push entirely off screen.
            // If we "resize neighbors", it implies we are stealing/giving space.
            // Let's assume stealing/giving space is the intent for a "dashboard" builder.

            newLayout.x += delta;
            newLayout.w -= delta;

            // Constraint: Don't let width go below min
            if (newLayout.w < 200) {
                // If we hit constraint, we might need to clamp delta?
                // For now, let's just allow it or simple clamp inside component logic?
                // We'll return the calculation and let wrapper handle application/constraints or just clamp here.
                newLayout.w = 200;
                // If clamped, x shift should also be camped? Complex.
                // Keep simple for iteration 1.
                return; // Skip update if breaks constraint?
            }
        } else if (axis === 'h') {
            // Vertical Resize (South Handle)
            // Active item grew down (delta > 0)
            // Neighbor top edge moves down.
            newLayout.y += delta;
            newLayout.h -= delta;

            if (newLayout.h < 150) {
                newLayout.h = 150;
                return;
            }
        }

        updates.push({ itemId: neighbor.i, layout: newLayout });
    });

    return updates;
}
