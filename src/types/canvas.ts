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
