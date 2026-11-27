/**
 * 房間模式的舞台排版與「聲音跟著焦點」（純函式）。
 * 串流 item 只改 layout，不改 i／contentId：i 一改播放器就會重建（見 canvasItemOps 檔頭）。
 */
import type { CanvasItem } from '../types/canvas';
import { isCollapsedChat } from './canvasItemOps';
import { MIN_STREAM_CELLS } from '../components/Canvas/sizeLimits';

/** 候場在格線上的佔位欄寬（畫面上改用 wingRects 的像素位置浮在舞台上，見 SimpleCanvas） */
const WING_COLS = MIN_STREAM_CELLS;
/** 候場最多幾路；再多每格會矮於最小高度，呼叫端改用平分 */
const MAX_WINGS = 4;

const byPosition = (a: CanvasItem, b: CanvasItem) => a.layout.y - b.layout.y || a.layout.x - b.layout.x;

/** 把 0..24 列切成 m 段，第 k 段的 y 與 h（以邊取整，相鄰不留縫） */
function rowBand(k: number, m: number) {
    const y = Math.round((k * 24) / m);
    return { y, h: Math.round(((k + 1) * 24) / m) - y };
}

/**
 * 舞台排版：焦點佔滿整個串流區，聊天室在最右欄。
 * 其他串流（含空槽）在格線上依原位置排序疊在串流區右緣（與舞台重疊）：畫面上它們改用 wingRects 的像素位置
 * 浮在舞台右緣（照 2026-11 原型），格線位置只用來保留排序與「切回平分」時的依據。
 * 焦點不存在、不是串流，或其他路超過 4 路時回 null。
 */
export function stageLayout(items: readonly CanvasItem[], focusItemId: string, chatCols: number): CanvasItem[] | null {
    const focus = items.find(it => it.i === focusItemId);
    if (!focus || focus.type !== 'stream') return null;
    const others = items.filter(it => it.type === 'stream' && it.i !== focusItemId).sort(byPosition);
    if (others.length > MAX_WINGS) return null;

    const openChats = items.filter(it => it.type === 'chat' && !isCollapsedChat(it));
    const c = openChats.length > 0 ? chatCols : 0;
    const area = 24 - c;

    const layoutOf = new Map<string, CanvasItem['layout']>();
    layoutOf.set(focus.i, { x: 0, y: 0, w: area, h: 24 });
    others.forEach((it, k) => layoutOf.set(it.i, { x: area - WING_COLS, w: WING_COLS, ...rowBand(k, others.length) }));
    openChats.forEach((it, k) => layoutOf.set(it.i, { x: area, w: c, ...rowBand(k, openChats.length) }));

    return items.map(it => (layoutOf.has(it.i) ? { ...it, layout: layoutOf.get(it.i)! } : it));
}

/**
 * 房間模式只留一個聊天室並跟著焦點：保留第一個聊天室的 i（換頻道只重載聊天室 iframe），
 * 其餘聊天室刪掉；串流 item 一律原樣。沒有聊天室時不新增（使用者自己關掉的）。
 */
export function roomChatItems(items: readonly CanvasItem[], focusContentId: number | null | undefined): CanvasItem[] {
    const first = items.find(it => it.type === 'chat');
    if (!first) return [...items];
    const chat: CanvasItem = { ...first, sharedChat: true, contentId: focusContentId ?? first.contentId };
    return items.filter(it => it.type !== 'chat' || it === first).map(it => (it === first ? chat : it));
}

/** 焦點那路開聲音、其他靜音；只回傳需要改的那幾路。焦點不在清單時不改任何路 */
export function focusMuteUpdates(
    streams: readonly { id: number; isMuted?: boolean }[],
    focusStreamId: number,
): { id: number; isMuted: boolean }[] {
    if (!streams.some(s => s.id === focusStreamId)) return [];
    return streams
        .map(s => ({ id: s.id, isMuted: s.id !== focusStreamId }))
        .filter((u, i) => u.isMuted !== (streams[i].isMuted ?? false));
}

/** 候場浮窗的尺寸與留白（像素，照原型） */
const WING_W = 220;
const WING_H = 124;
const WING_GAP = 8;
const WING_RIGHT = 12;
const WING_MARGIN_Y = 60;

/**
 * 舞台模式候場浮窗的像素位置：貼舞台右緣、整組垂直置中。
 * 舞台太矮放不下時等比例縮小每格（上下各留 60px），不讓浮窗超出舞台。
 */
export function wingRects(count: number, stage: { x: number; y: number; width: number; height: number }) {
    if (count <= 0) return [];
    const room = Math.max(0, stage.height - 2 * WING_MARGIN_Y);
    const full = count * WING_H + (count - 1) * WING_GAP;
    const scale = full > room && full > 0 ? room / full : 1;
    const h = Math.floor(WING_H * scale);
    const w = Math.floor(WING_W * scale);
    const gap = Math.floor(WING_GAP * scale);
    const total = count * h + (count - 1) * gap;
    const top = stage.y + Math.round((stage.height - total) / 2);
    const x = stage.x + stage.width - WING_RIGHT - w;
    return Array.from({ length: count }, (_, k) => ({ x, y: top + k * (h + gap), width: w, height: h }));
}
