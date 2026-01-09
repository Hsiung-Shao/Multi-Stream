import { Layout } from 'react-grid-layout';

/**
 * Calculates a balanced grid layout for N items within a 24x24 container.
 * Used for N <= 16.
 */
export const calculateAutoGridLayout = (count: number): { x: number, y: number, w: number, h: number }[] => {
    const specs: { x: number, y: number, w: number, h: number }[] = [];

    // Grid Logic Configuration
    let cols = 1;
    let rows = 1;

    // Define grid structure based on count
    if (count <= 1) { cols = 1; rows = 1; }
    else if (count <= 2) { cols = 2; rows = 1; }
    else if (count <= 4) { cols = 2; rows = 2; }
    else if (count <= 6) { cols = 3; rows = 2; }
    else if (count <= 9) { cols = 3; rows = 3; }
    else if (count <= 12) { cols = 4; rows = 3; }
    else { cols = 4; rows = 4; } // Max 16

    // Avoid NaN if count is 0
    if (count === 0) return [];

    const cellW = Math.floor(24 / cols);
    const cellH = Math.floor(24 / rows);

    for (let i = 0; i < count; i++) {
        // Horizontal-First: Fill columns first (right), then rows (down)
        // r = floor(i / cols)
        // c = i % cols
        const r = Math.floor(i / cols);
        const c = i % cols;

        specs.push({
            x: c * cellW,
            y: r * cellH,
            w: cellW,
            h: cellH
        });
    }

    return specs;
};

// Define layout types
export type LayoutMode = 'video_only' | 'with_chat';

interface PresetItem {
    i: string; // Will be replaced by actual ID
    type: 'stream' | 'chat';
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Generates a standard layout for N streams based on Holodex 24x24 grid system.
 * 
 * @param streamIds Array of stream IDs to layout
 * @param mode 'video_only' or 'with_chat'
 */
export const generateLayout = (streamIds: (number | string)[], mode: LayoutMode = 'video_only'): any[] => {
    const count = streamIds.length;
    let items: any[] = [];

    // Helper to add item
    const addItem = (id: string | number, type: 'stream' | 'chat', x: number, y: number, w: number, h: number) => {
        // Use a consistent ID format matching store
        const uniqueSuffix = Math.random().toString(36).substr(2, 5);
        // Note: Real IDs should come from existing items if possible to avoid re-mounting.
        // But for "Applying Preset", we might be calculating new positions for EXISTING items.
        // This function returns abstract layout specs, caller maps them to items.

        // Actually, we return a list of layout objects keyed by index or simple structure?
        // Let's return abstract definitions.
        return { x, y, w, h };
    };

    // --- Layout Logic (24x24 Grid) ---
    // 1 Grid Unit = 16:9 Aspect Ratio (approx)

    // N=1
    if (count === 1) {
        if (mode === 'video_only') {
            items.push({ type: 'stream', x: 0, y: 0, w: 24, h: 24 });
        } else {
            // 1 Stream + Chat (Sidebar)
            // Stream: 20w x 24h, Chat: 4w x 24h
            items.push({ type: 'stream', x: 0, y: 0, w: 20, h: 24 });
            items.push({ type: 'chat', x: 20, y: 0, w: 4, h: 24 });
        }
    }
    // N=2
    else if (count === 2) {
        if (mode === 'video_only') {
            // Split Vertical (Left/Right)
            items.push({ type: 'stream', x: 0, y: 0, w: 12, h: 24 });
            items.push({ type: 'stream', x: 12, y: 0, w: 12, h: 24 });
        } else {
            // 2 Streams + Chat
            // Stream: 20w, Chat: 4w.
            items.push({ type: 'stream', x: 0, y: 0, w: 20, h: 12 });
            items.push({ type: 'chat', x: 20, y: 0, w: 4, h: 12 });

            items.push({ type: 'stream', x: 0, y: 12, w: 20, h: 12 });
            items.push({ type: 'chat', x: 20, y: 12, w: 4, h: 12 });
        }
    }
    // N=3
    else if (count === 3) {
        // ... (Keep existing N=3 logic as it was mostly placeholders or "Video Only" fallback)
        // Reverting to the code block logic for N=3:
        if (mode === 'video_only') {
            // 1 Big Left, 2 Small Right (Stacked)
            items.push({ type: 'stream', x: 0, y: 0, w: 16, h: 24 }); // Main
            items.push({ type: 'stream', x: 16, y: 0, w: 8, h: 12 }); // Top Right
            items.push({ type: 'stream', x: 16, y: 12, w: 8, h: 12 }); // Bottom Right
        } else {
            // Let's fallback to Video Only logic but reduce width to fit chat?
            // Stream 1 (15w x 24h).
            // Chat 1 (3w x 24h)?
            // Stream 2 (6w)...

            // Placeholder: Use Video Only for >2 for now, as user said "Many -> No chat"
            // But N=3 is boundary.
            // Let's do Video Only layout for N=3 for now.
            items.push({ type: 'stream', x: 0, y: 0, w: 16, h: 24 }); // Main
            items.push({ type: 'stream', x: 16, y: 0, w: 8, h: 12 }); // Top Right
            items.push({ type: 'stream', x: 16, y: 12, w: 8, h: 12 }); // Bottom Right
        }
    }
    // N=4
    else if (count === 4) {
        // 2x2 Grid
        items.push({ type: 'stream', x: 0, y: 0, w: 12, h: 12 });
        items.push({ type: 'stream', x: 12, y: 0, w: 12, h: 12 });
        items.push({ type: 'stream', x: 0, y: 12, w: 12, h: 12 });
        items.push({ type: 'stream', x: 12, y: 12, w: 12, h: 12 });
    }
    else {
        // ... (Keep existing generic logic)
        const colCount = Math.ceil(Math.sqrt(count));
        const rowCount = Math.ceil(count / colCount);

        const w = Math.floor(24 / colCount);
        const h = Math.floor(24 / rowCount);

        for (let i = 0; i < count; i++) {
            const r = Math.floor(i / colCount);
            const c = i % colCount;
            items.push({ type: 'stream', x: c * w, y: r * h, w, h });
        }
    }

    return items;
};

/**
 * Calculates a Dual-Direction layout:
 * Streams fill from Left -> Right (Column-Major).
 * Chats fill from Right -> Left (Column-Major).
 */
export const calculateDualDirectionLayout = (items: any[]): any[] => {
    const count = items.length;
    if (count === 0) return [];

    // 1. Determine Grid Dimensions
    let cols = 1;
    let rows = 1;
    if (count <= 1) { cols = 1; rows = 1; }
    else if (count <= 2) { cols = 2; rows = 1; }
    else if (count <= 4) { cols = 2; rows = 2; }
    else if (count <= 6) { cols = 3; rows = 2; }
    else if (count <= 9) { cols = 3; rows = 3; }
    else if (count <= 12) { cols = 4; rows = 3; }
    else { cols = 4; rows = 4; }

    const cellW = Math.floor(24 / cols);
    const cellH = Math.floor(24 / rows);

    // 2. Separate Items
    const streams = items.filter(i => i.type === 'stream');
    const chats = items.filter(i => i.type === 'chat');

    // 3. Grid Tracking
    const grid: boolean[][] = Array.from({ length: cols }, () => Array(rows).fill(false));

    // 4. Place Chats (Right -> Left, Top -> Bottom)
    const newItems: any[] = [];

    let chatIdx = 0;
    for (let x = cols - 1; x >= 0; x--) {
        for (let y = 0; y < rows; y++) {
            if (chatIdx < chats.length) {
                // Place Chat
                const chat = chats[chatIdx];
                // Limit width to 4, right align in cell
                const width = Math.min(cellW, 4);
                const cellX = x * cellW;
                const layoutX = (cellX + cellW) - width;

                newItems.push({
                    ...chat,
                    layout: { x: layoutX, y: y * cellH, w: width, h: cellH }
                });
                grid[x][y] = true; // Mark occupied
                chatIdx++;
            }
        }
    }

    // 5. Place Streams (Left -> Right, Top -> Bottom)
    let streamIdx = 0;
    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            if (!grid[x][y]) { // Only if not occupied by chat
                if (streamIdx < streams.length) {
                    const stream = streams[streamIdx];
                    newItems.push({
                        ...stream,
                        layout: { x: x * cellW, y: y * cellH, w: cellW, h: cellH }
                    });
                    grid[x][y] = true;
                    streamIdx++;
                }
            }
        }
    }

    // ---------------------------------------------------------
    // Post-Processing: Eliminate Gaps (Dynamic Sizing)
    // ---------------------------------------------------------

    // Step A: "Gravity Right" for Chats
    // Push chat windows as far right as possible within their row.
    for (let r = 0; r < rows; r++) {
        const rowItems = newItems.filter(i => i.layout.y === r * cellH);

        // Sort items in this row by their current X descending
        rowItems.sort((a, b) => b.layout.x - a.layout.x);

        // Items processed from Right to Left
        let currentRightEdge = 24; // Container Width

        rowItems.forEach(item => {
            if (item.type === 'chat') {
                // Snap to current right edge
                const targetX = currentRightEdge - item.layout.w;
                // Move it if it's not already there
                if (item.layout.x < targetX) {
                    item.layout.x = targetX;
                }
                currentRightEdge = item.layout.x;
            } else {
                // Stream acts as a wall
                currentRightEdge = item.layout.x;
            }
        });
    }

    // Step B: "Expand Streams"
    // Expand streams to fill the gap to their immediate right.
    newItems.forEach(item => {
        if (item.type === 'stream') {
            const currentR = item.layout.x + item.layout.w;
            const y = item.layout.y;

            // Find nearest obstruction to the right in the same row
            let limitX = 24; // Default to container edge

            newItems.forEach(other => {
                if (other === item) return;
                // Check simple row alignment
                if (other.layout.y === y) {
                    if (other.layout.x >= currentR) {
                        if (other.layout.x < limitX) {
                            limitX = other.layout.x;
                        }
                    }
                }
            });

            // Expand width
            const newW = limitX - item.layout.x;
            if (newW > item.layout.w) {
                item.layout.w = newW;
            }
        }
    });

    return newItems;
};
