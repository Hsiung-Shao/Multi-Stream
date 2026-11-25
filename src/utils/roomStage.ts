/**
 * 房間模式的舞台排版與「聲音跟著焦點」（純函式）。
 * 只改 layout，不改 i／contentId／sharedChat：i 一改播放器就會重建（見 canvasItemOps 檔頭）。
 */
import type { CanvasItem } from '../types/canvas';
import { isCollapsedChat } from './canvasItemOps';
import { MIN_STREAM_CELLS } from '../components/Canvas/sizeLimits';

/** 候場欄寬：剛好是串流視窗的最小寬 */
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
 * 舞台排版：焦點佔串流區左側全高，其他串流（含空槽）依原位置排序疊在右側候場欄，聊天室在最右欄。
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
    layoutOf.set(focus.i, { x: 0, y: 0, w: others.length ? area - WING_COLS : area, h: 24 });
    others.forEach((it, k) => layoutOf.set(it.i, { x: area - WING_COLS, w: WING_COLS, ...rowBand(k, others.length) }));
    openChats.forEach((it, k) => layoutOf.set(it.i, { x: area, w: c, ...rowBand(k, openChats.length) }));

    return items.map(it => (layoutOf.has(it.i) ? { ...it, layout: layoutOf.get(it.i)! } : it));
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
