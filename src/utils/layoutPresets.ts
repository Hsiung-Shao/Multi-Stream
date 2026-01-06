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
        // Vertical-First: Fill rows first (down), then columns (right)
        // c = floor(i / rows)
        // r = i % rows
        const c = Math.floor(i / rows);
        const r = i % rows;

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
            // Stream: 18w x 24h, Chat: 6w x 24h
            items.push({ type: 'stream', x: 0, y: 0, w: 18, h: 24 });
            items.push({ type: 'chat', x: 18, y: 0, w: 6, h: 24 });
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
            // Option A: Stacked. Top(Stream+Chat), Bottom(Stream+Chat)
            // Height 12 each.
            // Stream: 18w, Chat: 6w.
            items.push({ type: 'stream', x: 0, y: 0, w: 18, h: 12 });
            items.push({ type: 'chat', x: 18, y: 0, w: 6, h: 12 });

            items.push({ type: 'stream', x: 0, y: 12, w: 18, h: 12 });
            items.push({ type: 'chat', x: 18, y: 12, w: 6, h: 12 });
        }
    }
    // N=3
    else if (count === 3) {
        if (mode === 'video_only') {
            // 1 Big Left, 2 Small Right (Stacked)
            // Big: 12w x 24h? Or 16w?
            // If 16w, Right has 8w.
            // 8w x 12h (2 blocks).
            items.push({ type: 'stream', x: 0, y: 0, w: 16, h: 24 }); // Main
            items.push({ type: 'stream', x: 16, y: 0, w: 8, h: 12 }); // Top Right
            items.push({ type: 'stream', x: 16, y: 12, w: 8, h: 12 }); // Bottom Right
        } else {
            // 3 Streams with Chat (User: Chats on right)
            // Maybe Main + 2 Side, but all chat logic compressed?
            // Or simple grid?
            // Let's try: Main Top (Width 18, Chat 6).
            // Bottom 2 split?
            // Or: Use the "Focus" layout logic.

            // Implementation for "With Chat" N=3
            // Main Left (14w x 24h), Chat Right (4w x 24h)? No.
            // Let's stick to consistent columns.
            // Col1: Main Stream (12w x 24h)
            // Col2: Stream 2 (6w x 12h) + Chat 2 (6w x 12h)?
            // This gets complex.

            // Simplified "With Chat":
            // 1 Main (16w x 24h). No chat for main?
            // User: "3 -> Chats on right".
            // Maybe: 1 Main (16w x 24h).
            // Side: Col width 8.
            // Top: Stream 2 (8w x 6h) + Chat 2 (8w x 6h) -- stacked?

            // Let's follow a "Grid" approach for safety until refined.
            // 2x2 Grid with one empty?
            // Row 1: Stream1(12) + Chat1(4) | Stream2(12) + Chat2(4)? -> Width 32 overflow.

            // Let's do: 3 Rows stacked? No.

            // "Pin" style logic:
            // Stream 1 (18w x 24h).
            // Stream 2, 3 hidden?

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
        // 12w x 12h each.
        items.push({ type: 'stream', x: 0, y: 0, w: 12, h: 12 });
        items.push({ type: 'stream', x: 12, y: 0, w: 12, h: 12 });
        items.push({ type: 'stream', x: 0, y: 12, w: 12, h: 12 });
        items.push({ type: 'stream', x: 12, y: 12, w: 12, h: 12 });
    }
    else {
        // Generic Grid for 5+
        // Cols = ceil(sqrt(n)). Rows = ceil(n/cols).
        const colCount = Math.ceil(Math.sqrt(count));
        const rowCount = Math.ceil(count / colCount);

        const w = Math.floor(24 / colCount);
        const h = Math.floor(24 / rowCount); // Distribute 24 units height.

        for (let i = 0; i < count; i++) {
            const r = Math.floor(i / colCount);
            const c = i % colCount;
            items.push({ type: 'stream', x: c * w, y: r * h, w, h });
        }
    }

    return items;
};
