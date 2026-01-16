

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

export interface LayoutTemplate {
    id: string;
    nameKey: string; // i18n key or simple name for now
    icon: string; // Lucide icon name or similar (string identifier)
    count: number; // Required stream count
    type: LayoutMode;
    // Function to generate items for N streams
    // contentId can be number (streamId) or null (empty slot)
    generate: (streamIds: (number | string | null)[]) => any[];
}

/**
 * Generates a standard layout for N streams.
 * Priority: Matches explicit template -> Falls back to Auto Grid
 */
export const getStandardLayout = (count: number, mode: LayoutMode = 'video_only'): any[] => {
    const targetTemplateId = `template-${count}-${mode === 'video_only' ? 'landscape' : 'chat'}`;
    const standardTemplate = layoutTemplates.find(t => t.id === targetTemplateId);

    if (standardTemplate) {
        // Generate placeholder IDs if not provided
        const ids = Array(count).fill(null);
        return standardTemplate.generate(ids);
    }

    // Fallback: Auto Grid
    const specs = calculateAutoGridLayout(count);
    return specs.map(spec => ({
        type: 'stream',
        x: spec.x,
        y: spec.y,
        w: spec.w,
        h: spec.h
    }));
};

/**
 * Generates a Layout Spec (CanvasItems) based on a template ID and provided stream IDs.
 */
export const generateLayoutFromTemplate = (templateId: string, streamIds: (number | string)[]): any[] => {
    const template = layoutTemplates.find(t => t.id === templateId);
    if (!template) return [];

    // Ensure we have enough IDs, fill with null if needed
    const paddedIds: (number | string | null)[] = [...streamIds];
    while (paddedIds.length < template.count) {
        paddedIds.push(null);
    }

    return template.generate(paddedIds);
}

export const layoutTemplates: LayoutTemplate[] = [
    // ==================================================================================
    // 1. VIDEO ONLY MODE (一般橫向/網格)
    // ==================================================================================
    {
        id: 'template-1-landscape',
        nameKey: 'layout.t_1_v',
        icon: 'Square',
        count: 1,
        type: 'video_only',
        generate: (streamIds) => [
            { type: 'stream', x: 0, y: 0, w: 24, h: 24, contentId: streamIds[0] ?? null }
        ]
    },
    {
        id: 'template-2-landscape',
        nameKey: 'layout.t_2_v',
        icon: 'Columns2',
        count: 2,
        type: 'video_only',
        generate: (streamIds) => [
            { type: 'stream', x: 0, y: 0, w: 12, h: 24, contentId: streamIds[0] ?? null },
            { type: 'stream', x: 12, y: 0, w: 12, h: 24, contentId: streamIds[1] ?? null }
        ]
    },
    {
        id: 'template-3-landscape', // Renamed from focus to landscape for consistency as default "3-person"
        nameKey: 'layout.t_3_v',
        icon: 'PanelLeft',
        count: 3,
        type: 'video_only',
        generate: (streamIds) => [
            { type: 'stream', x: 0, y: 0, w: 16, h: 24, contentId: streamIds[0] ?? null }, // Main
            { type: 'stream', x: 16, y: 0, w: 8, h: 12, contentId: streamIds[1] ?? null }, // Top Right
            { type: 'stream', x: 16, y: 12, w: 8, h: 12, contentId: streamIds[2] ?? null } // Bottom Right
        ]
    },
    {
        id: 'template-4-landscape',
        nameKey: 'layout.t_4_v',
        icon: 'LayoutGrid',
        count: 4,
        type: 'video_only',
        generate: (streamIds) => [
            { type: 'stream', x: 0, y: 0, w: 12, h: 12, contentId: streamIds[0] ?? null },
            { type: 'stream', x: 12, y: 0, w: 12, h: 12, contentId: streamIds[1] ?? null },
            { type: 'stream', x: 0, y: 12, w: 12, h: 12, contentId: streamIds[2] ?? null },
            { type: 'stream', x: 12, y: 12, w: 12, h: 12, contentId: streamIds[3] ?? null }
        ]
    },
    {
        id: 'template-5-landscape',
        nameKey: 'layout.t_5_v',
        icon: 'Columns3',
        count: 5,
        type: 'video_only',
        generate: (streamIds) => [
            // Left Col
            { type: 'stream', x: 0, y: 0, w: 6, h: 12, contentId: streamIds[0] ?? null },
            { type: 'stream', x: 0, y: 12, w: 6, h: 12, contentId: streamIds[1] ?? null },
            // Center Main
            { type: 'stream', x: 6, y: 0, w: 12, h: 24, contentId: streamIds[2] ?? null },
            // Right Col
            { type: 'stream', x: 18, y: 0, w: 6, h: 12, contentId: streamIds[3] ?? null },
            { type: 'stream', x: 18, y: 12, w: 6, h: 12, contentId: streamIds[4] ?? null },
        ]
    },
    {
        id: 'template-6-landscape',
        nameKey: 'layout.t_6_v',
        icon: 'Grid3x3',
        count: 6,
        type: 'video_only',
        generate: (streamIds) => {
            const items: any[] = [];
            const w = 8, h = 12; // 24/3 = 8
            for (let i = 0; i < 6; i++) {
                const c = i % 3;
                const r = Math.floor(i / 3);
                items.push({ type: 'stream', x: c * w, y: r * h, w, h, contentId: streamIds[i] ?? null });
            }
            return items;
        }
    },

    // ==================================================================================
    // 2. WITH CHAT MODE (包含聊天室 - 嚴格 4 格寬)
    // ==================================================================================
    {
        id: 'template-1-chat',
        nameKey: 'layout.t_1_c',
        icon: 'Square',
        count: 1,
        type: 'with_chat',
        generate: (streamIds) => [
            { type: 'stream', x: 0, y: 0, w: 20, h: 24, contentId: streamIds[0] ?? null }, // 24 - 4 = 20
            { type: 'chat', x: 20, y: 0, w: 4, h: 24, contentId: streamIds[0] ?? null }    // Fixed 4w
        ]
    },
    {
        id: 'template-2-chat',
        nameKey: 'layout.t_2_c',
        icon: 'Columns2',
        count: 2,
        type: 'with_chat',
        generate: (streamIds) => {
            // Split 24 into 2 blocks of 12.
            // Each block: Stream 8w + Chat 4w = 12w.
            const items: any[] = [];
            // Slot 1
            items.push({ type: 'stream', x: 0, y: 0, w: 8, h: 24, contentId: streamIds[0] ?? null });
            items.push({ type: 'chat', x: 8, y: 0, w: 4, h: 24, contentId: streamIds[0] ?? null });
            // Slot 2
            items.push({ type: 'stream', x: 12, y: 0, w: 8, h: 24, contentId: streamIds[1] ?? null });
            items.push({ type: 'chat', x: 20, y: 0, w: 4, h: 24, contentId: streamIds[1] ?? null });
            return items;
        }
    },
    {
        id: 'template-3-chat',
        nameKey: 'layout.t_3_c',
        icon: 'PanelLeft',
        count: 3,
        type: 'with_chat',
        generate: (streamIds) => {
            // N=3 With Chat: 2 Rows
            // Top Row: 3 Streams (8x12 each)
            // Bottom Row: 3 Chats (8x12 each)
            const items: any[] = [];

            // Top Row: Streams
            for (let i = 0; i < 3; i++) {
                items.push({ type: 'stream', x: i * 8, y: 0, w: 8, h: 12, contentId: streamIds[i] ?? null });
            }

            // Bottom Row: Chats
            for (let i = 0; i < 3; i++) {
                items.push({ type: 'chat', x: i * 8, y: 12, w: 8, h: 12, contentId: streamIds[i] ?? null });
            }
            return items;
        }
    },
    {
        id: 'template-4-chat',
        nameKey: 'layout.t_4_c',
        icon: 'LayoutGrid',
        count: 4,
        type: 'with_chat',
        generate: (streamIds) => {
            // 2x2 Grid. Each cell 12x12.
            // Cell: Stream 8w + Chat 4w.
            const items: any[] = [];
            // Row 1
            items.push({ type: 'stream', x: 0, y: 0, w: 8, h: 12, contentId: streamIds[0] ?? null });
            items.push({ type: 'chat', x: 8, y: 0, w: 4, h: 12, contentId: streamIds[0] ?? null });

            items.push({ type: 'stream', x: 12, y: 0, w: 8, h: 12, contentId: streamIds[1] ?? null });
            items.push({ type: 'chat', x: 20, y: 0, w: 4, h: 12, contentId: streamIds[1] ?? null });

            // Row 2
            items.push({ type: 'stream', x: 0, y: 12, w: 8, h: 12, contentId: streamIds[2] ?? null });
            items.push({ type: 'chat', x: 8, y: 12, w: 4, h: 12, contentId: streamIds[2] ?? null });

            items.push({ type: 'stream', x: 12, y: 12, w: 8, h: 12, contentId: streamIds[3] ?? null });
            items.push({ type: 'chat', x: 20, y: 12, w: 4, h: 12, contentId: streamIds[3] ?? null });
            return items;
        }
    },

    {
        id: 'template-6-chat',
        nameKey: 'layout.t_6_c',
        icon: 'Grid3x3',
        count: 6,
        type: 'with_chat',
        generate: (streamIds) => {
            // 3x2 Grid. Each slot 8w (24/3).
            // Width 5 Video + Width 3 Chat. (User Request: S=5, C=3)
            const items: any[] = [];
            const w = 8, h = 12;
            for (let i = 0; i < 6; i++) {
                const c = i % 3;
                const r = Math.floor(i / 3);

                const baseX = c * w;
                // Stream: 5w
                items.push({ type: 'stream', x: baseX, y: r * h, w: 5, h: 12, contentId: streamIds[i] ?? null });
                // Chat: 3w
                items.push({ type: 'chat', x: baseX + 5, y: r * h, w: 3, h: 12, contentId: streamIds[i] ?? null });
            }
            return items;
        }
    },

    // ==================================================================================
    // 3. SPECIAL / CREATIVE (Video Only Presets exposed as Custom or Special)
    // ==================================================================================
    {
        id: 'template-5-cinema',
        nameKey: 'layout.t_5_cinema',
        icon: 'Monitor',
        count: 5,
        type: 'video_only',
        generate: (streamIds) => [
            { type: 'stream', x: 0, y: 0, w: 24, h: 14, contentId: streamIds[0] ?? null }, // Main
            { type: 'stream', x: 0, y: 14, w: 6, h: 10, contentId: streamIds[1] ?? null },
            { type: 'stream', x: 6, y: 14, w: 6, h: 10, contentId: streamIds[2] ?? null },
            { type: 'stream', x: 12, y: 14, w: 6, h: 10, contentId: streamIds[3] ?? null },
            { type: 'stream', x: 18, y: 14, w: 6, h: 10, contentId: streamIds[4] ?? null }
        ]
    },
    {
        id: 'template-7-cinema',
        nameKey: 'layout.t_7_cinema',
        icon: 'Monitor',
        count: 7,
        type: 'video_only',
        generate: (streamIds) => {
            const items: any[] = [];
            items.push({ type: 'stream', x: 0, y: 0, w: 24, h: 16, contentId: streamIds[0] ?? null });
            // Bottom 6 items (4w each)
            for (let i = 0; i < 6; i++) {
                items.push({ type: 'stream', x: i * 4, y: 16, w: 4, h: 8, contentId: streamIds[i + 1] ?? null });
            }
            return items;
        }
    },

    // High Density Grids (Defined for standard access)
    {
        id: 'template-8-grid',
        nameKey: 'layout.t_8_grid',
        icon: 'LayoutGrid',
        count: 8,
        type: 'video_only',
        generate: (streamIds) => calculateAutoGridLayout(8).map((spec, i) => ({
            type: 'stream', ...spec, contentId: streamIds[i] ?? null
        }))
    },
    {
        id: 'template-12-grid',
        nameKey: 'layout.t_12_grid',
        icon: 'Grid3x3',
        count: 12,
        type: 'video_only',
        generate: (streamIds) => calculateAutoGridLayout(12).map((spec, i) => ({
            type: 'stream', ...spec, contentId: streamIds[i] ?? null
        }))
    },
    {
        id: 'template-16-grid',
        nameKey: 'layout.t_16_grid',
        icon: 'Grid',
        count: 16,
        type: 'video_only',
        generate: (streamIds) => calculateAutoGridLayout(16).map((spec, i) => ({
            type: 'stream', ...spec, contentId: streamIds[i] ?? null
        }))
    }
];
