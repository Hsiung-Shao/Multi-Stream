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
    /**
     * N 串 + 1 共用聊天室的那個聊天室。串流刪到只剩 1 路時，
     * 「1 串流＋1 聊天室」與「1 人含聊天室」版型長得一樣，靠這個標記區分，
     * 否則再新增一路就會變成每路各一個聊天室。
     */
    sharedChat?: boolean;
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
    /** 存檔時是共用聊天室（見 CanvasItem.sharedChat） */
    sharedChat?: boolean;
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
