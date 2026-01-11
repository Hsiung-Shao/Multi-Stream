

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

// --- New: Layout Templates ---

export interface LayoutTemplate {
    id: string;
    nameKey: string; // i18n key or simple name for now
    icon: string; // Lucide icon name or similar (string identifier)
    count: number; // Required stream count
    type: 'landscape' | 'vertical';
    // Function to generate items for N streams
    generate: (streamIds: (number | string | null)[]) => any[];
}

export const layoutTemplates: LayoutTemplate[] = [
    // --- Landscape ---
    {
        id: 'template-1-landscape',
        nameKey: '1人 (橫)',
        icon: 'Square',
        count: 1,
        type: 'landscape',
        generate: (streamIds) => {
            const id = streamIds[0] ?? null;
            return [
                { type: 'stream', x: 0, y: 0, w: 19, h: 24, contentId: id },
                { type: 'chat', x: 19, y: 0, w: 5, h: 24, contentId: id }
            ];
        }
    },
    {
        id: 'template-2-landscape',
        nameKey: '2人 (橫)',
        icon: 'Columns2',
        count: 2,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            // Slot 1
            const id0 = streamIds[0] ?? null;
            items.push({ type: 'stream', x: 0, y: 0, w: 9, h: 24, contentId: id0 });
            items.push({ type: 'chat', x: 9, y: 0, w: 3, h: 24, contentId: id0 });

            // Slot 2
            const id1 = streamIds[1] ?? null;
            items.push({ type: 'stream', x: 12, y: 0, w: 9, h: 24, contentId: id1 });
            items.push({ type: 'chat', x: 21, y: 0, w: 3, h: 24, contentId: id1 });

            return items;
        }
    },
    {
        id: 'template-3-focus',
        nameKey: '3人 (焦點)',
        icon: 'PanelLeft',
        count: 3,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            // Main (Left)
            const id0 = streamIds[0] ?? null;
            items.push({ type: 'stream', x: 0, y: 0, w: 13, h: 24, contentId: id0 });
            items.push({ type: 'chat', x: 13, y: 0, w: 3, h: 24, contentId: id0 });

            // Side Top
            const id1 = streamIds[1] ?? null;
            items.push({ type: 'stream', x: 16, y: 0, w: 5, h: 12, contentId: id1 });
            items.push({ type: 'chat', x: 21, y: 0, w: 3, h: 12, contentId: id1 });

            // Side Bottom
            const id2 = streamIds[2] ?? null;
            items.push({ type: 'stream', x: 16, y: 12, w: 5, h: 12, contentId: id2 });
            items.push({ type: 'chat', x: 21, y: 12, w: 3, h: 12, contentId: id2 });

            return items;
        }
    },
    {
        id: 'template-4-grid',
        nameKey: '4人 (網格)',
        icon: 'LayoutGrid',
        count: 4,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            const cells = [
                { sx: 0, sy: 0, cx: 9, cy: 0 },
                { sx: 12, sy: 0, cx: 21, cy: 0 },
                { sx: 0, sy: 12, cx: 9, cy: 12 },
                { sx: 12, sy: 12, cx: 21, cy: 12 },
            ];
            streamIds.slice(0, 4).forEach((id, idx) => {
                const cell = cells[idx];
                items.push({ type: 'stream', x: cell.sx, y: cell.sy, w: 9, h: 12, contentId: id });
                items.push({ type: 'chat', x: cell.cx, y: cell.cy, w: 3, h: 12, contentId: id });
            });
            return items;
        }
    },
    {
        id: 'template-6-grid',
        nameKey: '6人 (網格)',
        icon: 'Grid3x3', // Close enough
        count: 6,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            const w = 8; // Cell Width
            const h = 12; // Cell Height
            // Grid 3x2. 
            // In each 8x12 cell: Stream 5w, Chat 3w.
            const cols = 3;
            streamIds.slice(0, 6).forEach((id, idx) => {
                const c = idx % cols;
                const r = Math.floor(idx / cols);
                const baseX = c * w;
                const baseY = r * h;

                items.push({ type: 'stream', x: baseX, y: baseY, w: 5, h: 12, contentId: id });
                items.push({ type: 'chat', x: baseX + 5, y: baseY, w: 3, h: 12, contentId: id });
            });
            return items;
        }
    },
    // --- Focus Series (Sidebar/Main) ---
    {
        id: 'template-3-focus-left',
        nameKey: 'layout.3_focus_left',
        icon: 'PanelLeft',
        count: 3,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            // Side 1 (Left Top)
            items.push({ type: 'stream', x: 0, y: 0, w: 6, h: 12, contentId: streamIds[0] ?? null }); // No chat
            // Side 2 (Left Bottom)
            items.push({ type: 'stream', x: 0, y: 12, w: 6, h: 12, contentId: streamIds[1] ?? null }); // No chat
            // Main (Right)
            const id2 = streamIds[2] ?? null;
            items.push({ type: 'stream', x: 6, y: 0, w: 14, h: 24, contentId: id2 });
            items.push({ type: 'chat', x: 20, y: 0, w: 4, h: 24, contentId: id2 });

            return items;
        }
    },
    {
        id: 'template-3-focus-right',
        nameKey: 'layout.3_focus_right',
        icon: 'PanelRight',
        count: 3,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            // Main (Left)
            const id0 = streamIds[0] ?? null;
            items.push({ type: 'stream', x: 0, y: 0, w: 14, h: 24, contentId: id0 });
            items.push({ type: 'chat', x: 14, y: 0, w: 4, h: 24, contentId: id0 });

            // Side 1 (Right Top)
            items.push({ type: 'stream', x: 18, y: 0, w: 6, h: 12, contentId: streamIds[1] ?? null });
            // Side 2 (Right Bottom)
            items.push({ type: 'stream', x: 18, y: 12, w: 6, h: 12, contentId: streamIds[2] ?? null });

            return items;
        }
    },
    {
        id: 'template-4-focus-left',
        nameKey: 'layout.4_focus_left',
        icon: 'PanelLeft',
        count: 4,
        type: 'landscape',
        generate: (streamIds) => {
            // Right Main, Left 3 Stack
            const items: any[] = [];
            // Side Stack (x=0, w=6 h=8)
            for (let i = 0; i < 3; i++) {
                const id = streamIds[i] ?? null;
                items.push({ type: 'stream', x: 0, y: i * 8, w: 6, h: 8, contentId: id });
            }
            // Main (Right)
            const id3 = streamIds[3] ?? null;
            items.push({ type: 'stream', x: 6, y: 0, w: 14, h: 24, contentId: id3 });
            items.push({ type: 'chat', x: 20, y: 0, w: 4, h: 24, contentId: id3 });

            return items;
        }
    },
    {
        id: 'template-4-focus-right',
        nameKey: 'layout.4_focus_right',
        icon: 'PanelRight',
        count: 4,
        type: 'landscape',
        generate: (streamIds) => {
            // Left Main, Right 3 Stack
            const items: any[] = [];
            // Main (Left)
            const id0 = streamIds[0] ?? null;
            items.push({ type: 'stream', x: 0, y: 0, w: 14, h: 24, contentId: id0 });
            items.push({ type: 'chat', x: 14, y: 0, w: 4, h: 24, contentId: id0 });
            // Side Stack (x=18, w=6 h=8)
            for (let i = 0; i < 3; i++) {
                const id = streamIds[i + 1] ?? null;
                items.push({ type: 'stream', x: 18, y: i * 8, w: 6, h: 8, contentId: id });
            }
            return items;
        }
    },
    {
        id: 'template-4-focus-bottom',
        nameKey: 'layout.4_focus_bottom',
        icon: 'PanelBottom',
        count: 4,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            // Top Main (Full Width)
            const id0 = streamIds[0] ?? null;
            items.push({ type: 'stream', x: 0, y: 0, w: 20, h: 16, contentId: id0 });
            items.push({ type: 'chat', x: 20, y: 0, w: 4, h: 16, contentId: id0 });

            // Bottom Row (3 items, 8w each)
            for (let i = 0; i < 3; i++) {
                const id = streamIds[i + 1] ?? null;
                items.push({ type: 'stream', x: i * 8, y: 16, w: 8, h: 8, contentId: id });
            }
            return items;
        }
    },
    {
        id: 'template-5-focus-center',
        nameKey: 'layout.5_focus_center',
        icon: 'Columns3',
        count: 5,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            // Left Col (2 items)
            items.push({ type: 'stream', x: 0, y: 0, w: 6, h: 12, contentId: streamIds[0] ?? null });
            items.push({ type: 'stream', x: 0, y: 12, w: 6, h: 12, contentId: streamIds[1] ?? null });

            // Center Main
            const id2 = streamIds[2] ?? null;
            items.push({ type: 'stream', x: 6, y: 0, w: 12, h: 16, contentId: id2 });
            items.push({ type: 'chat', x: 6, y: 16, w: 12, h: 8, contentId: id2 }); // Large chat bottom

            // Right Col (2 items)
            items.push({ type: 'stream', x: 18, y: 0, w: 6, h: 12, contentId: streamIds[3] ?? null });
            items.push({ type: 'stream', x: 18, y: 12, w: 6, h: 12, contentId: streamIds[4] ?? null });

            return items;
        }
    },
    {
        id: 'template-5-focus-right-stack',
        nameKey: 'layout.5_focus_right_stack',
        icon: 'PanelRight',
        count: 5,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            // Main Left (18w)
            const id0 = streamIds[0] ?? null;
            items.push({ type: 'stream', x: 0, y: 0, w: 14, h: 24, contentId: id0 });
            items.push({ type: 'chat', x: 14, y: 0, w: 4, h: 24, contentId: id0 });
            // Right Stack (6w, 4 items x 6h)
            for (let i = 0; i < 4; i++) {
                const id = streamIds[i + 1] ?? null;
                items.push({ type: 'stream', x: 18, y: i * 6, w: 6, h: 6, contentId: id });
            }
            return items;
        }
    },

    // --- Cinema / Stage Series ---
    {
        id: 'template-5-cinema',
        nameKey: 'layout.5_cinema',
        icon: 'Monitor',
        count: 5,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            // Top Main
            const id0 = streamIds[0] ?? null;
            items.push({ type: 'stream', x: 0, y: 0, w: 24, h: 14, contentId: id0 });
            // No chat for main to verify cinema feel? Or add separate chat? Let's add chat overlay style (separate block)
            items.push({ type: 'chat', x: 20, y: 0, w: 4, h: 5, contentId: id0 }); // Tiny chat corner? No, let's keep it clean: No chat for cinema.

            // Bottom Row (4 items, 6w 10h)
            for (let i = 0; i < 4; i++) {
                const id = streamIds[i + 1] ?? null;
                items.push({ type: 'stream', x: i * 6, y: 14, w: 6, h: 10, contentId: id });
            }
            return items;
        }
    },
    {
        id: 'template-7-cinema',
        nameKey: 'layout.7_cinema',
        icon: 'Monitor',
        count: 7,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            // Top Main (Full width)
            const id0 = streamIds[0] ?? null;
            items.push({ type: 'stream', x: 0, y: 0, w: 20, h: 16, contentId: id0 });
            items.push({ type: 'chat', x: 20, y: 0, w: 4, h: 16, contentId: id0 });

            // Bottom Row (6 items, 4w 8h)
            for (let i = 0; i < 6; i++) {
                const id = streamIds[i + 1] ?? null;
                items.push({ type: 'stream', x: i * 4, y: 16, w: 4, h: 8, contentId: id });
            }
            return items;
        }
    },
    {
        id: 'template-5-versus',
        nameKey: 'layout.5_versus',
        icon: 'Swords', // Lucide 'Swords' needs import, checking if available. Using Columns2 as fallback.
        count: 5,
        type: 'landscape',
        generate: (streamIds) => {
            const items: any[] = [];
            // Top Left (Player 1)
            const id0 = streamIds[0] ?? null;
            items.push({ type: 'stream', x: 0, y: 0, w: 10, h: 14, contentId: id0 });
            items.push({ type: 'chat', x: 0, y: 14, w: 10, h: 10, contentId: id0 }); // Chat below

            // Top Right (Player 2)
            const id1 = streamIds[1] ?? null;
            items.push({ type: 'stream', x: 14, y: 0, w: 10, h: 14, contentId: id1 });
            items.push({ type: 'chat', x: 14, y: 14, w: 10, h: 10, contentId: id1 }); // Chat below

            // Middle Divider items (3 small ones vertically in center? 4w)
            // x=10, w=4
            for (let i = 0; i < 3; i++) {
                const id = streamIds[i + 2] ?? null;
                items.push({ type: 'stream', x: 10, y: i * 8, w: 4, h: 8, contentId: id });
            }
            return items;
        }
    },

    // --- High Density Grids ---
    {
        id: 'template-8-grid',
        nameKey: 'layout.8_grid',
        icon: 'LayoutGrid',
        count: 8,
        type: 'landscape',
        generate: (streamIds) => {
            // 4x2 Grid. No Chat.
            const items: any[] = [];
            const w = 6;
            const h = 12;
            streamIds.slice(0, 8).forEach((id, idx) => {
                const c = idx % 4;
                const r = Math.floor(idx / 4);
                items.push({ type: 'stream', x: c * w, y: r * h, w, h, contentId: id });
            });
            return items;
        }
    },
    {
        id: 'template-12-grid',
        nameKey: 'layout.12_grid',
        icon: 'Grid3x3',
        count: 12,
        type: 'landscape',
        generate: (streamIds) => {
            // 4x3 Grid. No Chat.
            const items: any[] = [];
            const w = 6;
            const h = 8;
            streamIds.slice(0, 12).forEach((id, idx) => {
                const c = idx % 4;
                const r = Math.floor(idx / 4);
                items.push({ type: 'stream', x: c * w, y: r * h, w, h, contentId: id });
            });
            return items;
        }
    },
    {
        id: 'template-16-grid',
        nameKey: 'layout.16_grid',
        icon: 'Grid', // fallback icon
        count: 16,
        type: 'landscape',
        generate: (streamIds) => {
            // 4x4 Grid. No Chat.
            const items: any[] = [];
            const w = 6;
            const h = 6;
            streamIds.slice(0, 16).forEach((id, idx) => {
                const c = idx % 4;
                const r = Math.floor(idx / 4);
                items.push({ type: 'stream', x: c * w, y: r * h, w, h, contentId: id });
            });
            return items;
        }
    },
];
