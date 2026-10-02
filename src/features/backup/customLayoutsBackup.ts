import { CustomLayout, LayoutSlot } from '../../types/canvas';

/** 單一備份檔最多收幾個自訂布局、每個布局最多幾格；防止手改或惡意的備份檔塞爆 localStorage */
const MAX_LAYOUTS = 200;
const MAX_SLOTS = 64;
const MAX_NAME_LENGTH = 100;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function sanitizeSlot(raw: unknown): LayoutSlot | null {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;
    if (!isFiniteNumber(s.x) || !isFiniteNumber(s.y) || !isFiniteNumber(s.w) || !isFiniteNumber(s.h)) return null;
    if (s.x < 0 || s.y < 0 || s.w <= 0 || s.h <= 0) return null;
    const slot: LayoutSlot = { x: s.x, y: s.y, w: s.w, h: s.h };
    if (s.type === 'stream' || s.type === 'chat') slot.type = s.type;
    if (s.sharedChat === true) slot.sharedChat = true;
    return slot;
}

/**
 * 把備份檔裡的 customLayouts 整理成可以安全寫回 store 的陣列。
 * 欄位不是陣列（舊版備份檔沒有這個欄位）回傳 null，呼叫端應保留目前的自訂布局；
 * 格式不對的布局或格子直接略過。
 */
export function sanitizeCustomLayouts(raw: unknown): CustomLayout[] | null {
    if (!Array.isArray(raw)) return null;
    const layouts: CustomLayout[] = [];
    const seen = new Set<string>();
    for (const item of raw.slice(0, MAX_LAYOUTS)) {
        if (!item || typeof item !== 'object') continue;
        const l = item as Record<string, unknown>;
        if (typeof l.id !== 'string' || !l.id || seen.has(l.id)) continue;
        if (typeof l.name !== 'string' || !l.name.trim()) continue;
        if (!Array.isArray(l.slots)) continue;
        const slots = l.slots.slice(0, MAX_SLOTS).map(sanitizeSlot).filter((s): s is LayoutSlot => s !== null);
        if (slots.length === 0) continue;
        seen.add(l.id);
        layouts.push({
            id: l.id,
            name: l.name.slice(0, MAX_NAME_LENGTH),
            slots,
            createdAt: isFiniteNumber(l.createdAt) ? l.createdAt : Date.now(),
        });
    }
    return layouts;
}
