export type CanvasItemType = 'stream' | 'chat';

export interface CanvasItemLayout {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface CanvasItem {
    i: string; // Unique ID
    type: CanvasItemType;
    contentId?: number | null; // Stream ID, null for empty slot
    layout: CanvasItemLayout;
}

export interface LayoutPreset {
    id: string;
    name: string;
    type: 'user' | 'system';
    items: CanvasItem[];
}

export interface LayoutSlot {
    x: number;
    y: number;
    w: number;
    h: number;
    type?: BaseCanvasItemType; // 'stream' or 'chat' hinting
}

export interface CustomLayout {
    id: string; // UUID
    name: string;
    slots: LayoutSlot[];
    createdAt: number;
    thumbnail?: string; // Optional visual representation
}

// Helper to extract Base type if needed, but 'CanvasItemType' is already simple string union.
type BaseCanvasItemType = CanvasItemType;
