

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
// shared_chat：N 路串流共用 1 個聊天室（聊天室標頭分頁切換顯示哪一路）
export type LayoutMode = 'video_only' | 'with_chat' | 'shared_chat';

export interface LayoutTemplate {
    id: string;
    nameKey: string; // i18n key or simple name for now
    icon: string; // Lucide icon name or similar (string identifier)
    count: number; // Required stream count
    type: LayoutMode;
    // Function to generate items for N streams
    // contentId can be number (streamId) or null (empty slot)
    // aspect：畫布寬高比（W/H），16:9 感知的版型用它算格數；其餘版型忽略
    generate: (streamIds: (number | string | null)[], aspect: number) => any[];
}

// ==================================================================================
// 16:9 感知
// ==================================================================================
//
// 畫布是 24 欄 × 24 列、依視窗寬高等分，所以格子不是正方形：一塊 w×h 格的像素比例是
// (w/h)·aspect。舊版型把格數寫死，寬螢幕上串流格比 16:9 寬，畫面左右出現黑邊。
// 這裡改用「16:9 單位格（tile）」描述版型結構，再依實際寬高比換算成整數格：
// 高度填滿畫布（上下不留空），寬度不超過 16:9，多出的寬度水平置中。

const DEFAULT_ASPECT = 16 / 9;
/** 與 SimpleCanvas 的 SIZE_LIMITS.stream 一致：推擠與縮放都不會讓串流小於 6×6 */
const MIN_STREAM_CELLS = 6;
/** 共用聊天室的寬度（SIZE_LIMITS.chat.maxW）；聊天室滿高 */
const SHARED_CHAT_W = 4;

/** 畫布寬高比，與 gridConfig 同源（SimpleCanvas 以 window.innerWidth/innerHeight 切格） */
export const getCanvasAspect = (): number => {
    if (typeof window === 'undefined' || !window.innerWidth || !window.innerHeight) return DEFAULT_ASPECT;
    return window.innerWidth / window.innerHeight;
};

export interface Tile { x: number; y: number; w: number; h: number }
export interface FitArea { x0: number; cols: number; rows: number }
export interface GridRect { x: number; y: number; w: number; h: number }

const FULL_AREA: FitArea = { x0: 0, cols: 24, rows: 24 };

/**
 * K×R 個 tile 在 area 內的單位尺寸 u 欄 × v 列。
 * 高度一律填滿（使用者裁定「上下不留空」：寧可播放器內有黑邊，也不要畫布上下空白）；
 * 寬度最多到 16:9（u ≈ v·16/(9·aspect)），不會比 16:9 更寬，所以不會出現左右黑邊，多出的寬度留給水平置中。
 * 列數塞不下最小尺寸時（例如 5 列以上）不低於 6，畫布往下長。
 */
function fitUnit(K: number, R: number, aspect: number, area: FitArea): { u: number; v: number; fits: boolean } {
    const v = Math.max(MIN_STREAM_CELLS, Math.floor(area.rows / R));
    const maxU = Math.floor(area.cols / K);
    const u = Math.max(MIN_STREAM_CELLS, Math.min(maxU, Math.round((v * 16) / (9 * aspect))));
    return { u, v, fits: v * R <= area.rows };
}

/** 一個 u×v 格視窗裡實際 16:9 畫面的邊長指標（與寬 u·aspect、高 v·16/9 取小者成正比），用來比較哪種排法畫面最大 */
const pictureSize = (u: number, v: number, aspect: number) => Math.min(u * aspect, (v * 16) / 9);

/**
 * 把以 16:9 tile 描述的版型換算成整數格：高度填滿 area，寬度上限 16:9 並水平置中。
 * tile 座標可以是小數（例如最後一列置中時的 0.5），換算後四捨五入到整數格。
 */
export function fitTiles(tiles: Tile[], aspect: number = DEFAULT_ASPECT, area: FitArea = FULL_AREA): GridRect[] {
    if (tiles.length === 0) return [];
    const K = Math.max(...tiles.map(t => t.x + t.w));
    const R = Math.max(...tiles.map(t => t.y + t.h));
    const { u, v } = fitUnit(K, R, aspect, area);
    const offX = area.x0 + Math.max(0, Math.floor((area.cols - K * u) / 2));
    const offY = Math.max(0, Math.floor((area.rows - R * v) / 2));
    return tiles.map(t => ({
        x: offX + Math.round(t.x * u),
        y: offY + Math.round(t.y * v),
        w: Math.round(t.w * u),
        h: Math.round(t.h * v),
    }));
}

/** k 欄均分的格線 tile；最後一列不滿時整列水平置中 */
function gridTiles(count: number, k: number): Tile[] {
    const tiles: Tile[] = [];
    const lastRowCount = count % k || k;
    const lastRow = Math.ceil(count / k) - 1;
    for (let i = 0; i < count; i++) {
        const r = Math.floor(i / k);
        const shift = r === lastRow ? (k - lastRowCount) / 2 : 0;
        tiles.push({ x: (i % k) + shift, y: r, w: 1, h: 1 });
    }
    return tiles;
}

/**
 * N 路串流 + 1 個共用聊天室。
 * 串流區（24 − 聊天室寬）裡列舉 k 欄的格線，取畫面總面積最大者；串流區與聊天室整塊水平置中、聊天室滿高。
 * 16:9 螢幕上 4 路＝田字、3 路＝田字缺一（最後一格置中）、2 路＝上下疊（比左右並排的畫面大）。
 */
export function generateSharedChatLayout(
    streamIds: (number | string | null)[],
    aspect: number = DEFAULT_ASPECT,
    chatContentId: number | string | null = streamIds[0] ?? null,
): any[] {
    const n = Math.max(1, streamIds.length);
    const area: FitArea = { x0: 0, cols: 24 - SHARED_CHAT_W, rows: 24 };
    const maxK = Math.min(n, Math.floor(area.cols / MIN_STREAM_CELLS));

    let best = { k: 1, u: 0, v: 0, score: -1 };
    for (let k = 1; k <= maxK; k++) {
        const { u, v, fits } = fitUnit(k, Math.ceil(n / k), aspect, area);
        // 不必往下長的解永遠優先；同級比每路實際畫面大小（路數相同，等同比總面積），平手取欄數多
        const score = (fits ? 1e6 : 0) + pictureSize(u, v, aspect);
        if (score > best.score || (score === best.score && k > best.k)) best = { k, u, v, score };
    }

    const tiles = gridTiles(n, best.k);
    const rects = fitTiles(tiles, aspect, area);
    // fitTiles 在串流區內置中；改成「串流區 + 聊天室」整塊置中，聊天室緊貼串流右側
    const blockW = best.k * best.u;
    const shiftX = Math.floor((24 - (blockW + SHARED_CHAT_W)) / 2) - Math.floor((area.cols - blockW) / 2);
    const items: any[] = rects.map((r, i) => ({ type: 'stream', ...r, x: r.x + shiftX, contentId: streamIds[i] ?? null }));
    items.push({ type: 'chat', x: Math.floor((24 - (blockW + SHARED_CHAT_W)) / 2) + blockW, y: 0, w: SHARED_CHAT_W, h: 24, contentId: chatContentId });
    return items;
}

/** 以 tile 結構定義的純串流版型 */
const tileTemplate = (tiles: Tile[]) =>
    (streamIds: (number | string | null)[], aspect: number) =>
        fitTiles(tiles, aspect).map((r, i) => ({ type: 'stream', ...r, contentId: streamIds[i] ?? null }));

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
        return standardTemplate.generate(ids, DEFAULT_ASPECT);
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
export const generateLayoutFromTemplate = (
    templateId: string,
    streamIds: (number | string)[],
    aspect: number = DEFAULT_ASPECT,
): any[] => {
    const template = layoutTemplates.find(t => t.id === templateId);
    if (!template) return [];

    // Ensure we have enough IDs, fill with null if needed
    const paddedIds: (number | string | null)[] = [...streamIds];
    while (paddedIds.length < template.count) {
        paddedIds.push(null);
    }

    return template.generate(paddedIds, aspect);
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
    // 2～6 路：結構（主次、欄列）與圖示不變，尺寸依畫布寬高比換算成最接近 16:9 的整數格並置中
    {
        id: 'template-2-landscape',
        nameKey: 'layout.t_2_v',
        icon: 'Columns2',
        count: 2,
        type: 'video_only',
        generate: tileTemplate([
            { x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 },
        ])
    },
    {
        id: 'template-3-landscape', // Renamed from focus to landscape for consistency as default "3-person"
        nameKey: 'layout.t_3_v',
        icon: 'PanelLeft',
        count: 3,
        type: 'video_only',
        generate: tileTemplate([
            { x: 0, y: 0, w: 2, h: 2 }, // Main
            { x: 2, y: 0, w: 1, h: 1 }, // Top Right
            { x: 2, y: 1, w: 1, h: 1 }, // Bottom Right
        ])
    },
    {
        id: 'template-4-landscape',
        nameKey: 'layout.t_4_v',
        icon: 'LayoutGrid',
        count: 4,
        type: 'video_only',
        generate: tileTemplate(gridTiles(4, 2))
    },
    {
        id: 'template-5-landscape',
        nameKey: 'layout.t_5_v',
        icon: 'Columns3',
        count: 5,
        type: 'video_only',
        generate: tileTemplate([
            // Left Col
            { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 1, w: 1, h: 1 },
            // Center Main
            { x: 1, y: 0, w: 2, h: 2 },
            // Right Col
            { x: 3, y: 0, w: 1, h: 1 }, { x: 3, y: 1, w: 1, h: 1 },
        ])
    },
    {
        id: 'template-6-landscape',
        nameKey: 'layout.t_6_v',
        icon: 'Grid3x3',
        count: 6,
        type: 'video_only',
        generate: tileTemplate(gridTiles(6, 3))
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
    // 2b. SHARED CHAT MODE（N 串 + 1 個共用聊天室）
    // ==================================================================================
    ...[2, 3, 4].map((n): LayoutTemplate => ({
        id: `template-${n}-sharedchat`,
        nameKey: `layout.t_${n}_sc`,
        icon: 'PanelRight',
        count: n,
        type: 'shared_chat',
        generate: (streamIds, aspect) => generateSharedChatLayout(streamIds.slice(0, n), aspect),
    })),

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
